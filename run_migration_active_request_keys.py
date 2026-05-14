#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Database migration: add database-backed duplicate request protection keys."""

import os
import sqlite3
import sys
from datetime import datetime

from backend.request_dedup import (
    build_leave_active_request_key,
    build_overtime_active_request_key,
)


DB_PATH = 'attendance.db'
MIGRATION_SQL_PATH = 'backend/migrations/add_active_request_keys.sql'


def backup_database(db_path: str):
    if not os.path.exists(db_path):
        print(f"[ERROR] 数据库文件不存在: {db_path}")
        return None

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = f"{db_path}.backup.{timestamp}"

    try:
        import shutil
        shutil.copy2(db_path, backup_path)
        print(f"[OK] 数据库已备份到: {backup_path}")
        return backup_path
    except Exception as exc:
        print(f"[WARN] 备份失败: {exc}")
        return None


def column_exists(cursor: sqlite3.Cursor, table_name: str, column_name: str) -> bool:
    cursor.execute(f"PRAGMA table_info({table_name})")
    return any(row[1] == column_name for row in cursor.fetchall())


def index_exists(cursor: sqlite3.Cursor, index_name: str) -> bool:
    cursor.execute(
        """
        SELECT 1
        FROM sqlite_master
        WHERE type = 'index' AND name = ?
        """,
        (index_name,),
    )
    return cursor.fetchone() is not None


def ensure_schema(cursor: sqlite3.Cursor):
    if not column_exists(cursor, 'leave_applications', 'active_request_key'):
        cursor.execute("ALTER TABLE leave_applications ADD COLUMN active_request_key VARCHAR(64)")

    if not column_exists(cursor, 'overtime_applications', 'active_request_key'):
        cursor.execute("ALTER TABLE overtime_applications ADD COLUMN active_request_key VARCHAR(64)")


def populate_leave_keys(cursor: sqlite3.Cursor):
    cursor.execute(
        """
        SELECT id, user_id, start_date, end_date, days, reason, leave_type_id, status
        FROM leave_applications
        ORDER BY id ASC
        """
    )

    seen = {}
    updated = 0
    duplicates = []
    for row in cursor.fetchall():
        request_key = build_leave_active_request_key(
            user_id=row[1],
            start_date=row[2],
            end_date=row[3],
            days=row[4],
            reason=row[5],
            leave_type_id=row[6],
            status=row[7],
        )
        if request_key:
            existing_id = seen.get(request_key)
            if existing_id is not None:
                duplicates.append((existing_id, row[0], request_key))
            else:
                seen[request_key] = row[0]

        cursor.execute(
            "UPDATE leave_applications SET active_request_key = ? WHERE id = ?",
            (request_key, row[0]),
        )
        updated += 1

    return updated, duplicates


def populate_overtime_keys(cursor: sqlite3.Cursor):
    cursor.execute(
        """
        SELECT id, user_id, start_time, end_time, hours, days, reason, overtime_type, status
        FROM overtime_applications
        ORDER BY id ASC
        """
    )

    seen = {}
    updated = 0
    duplicates = []
    for row in cursor.fetchall():
        request_key = build_overtime_active_request_key(
            user_id=row[1],
            start_time=row[2],
            end_time=row[3],
            hours=row[4],
            days=row[5],
            reason=row[6],
            overtime_type=row[7],
            status=row[8],
        )
        if request_key:
            existing_id = seen.get(request_key)
            if existing_id is not None:
                duplicates.append((existing_id, row[0], request_key))
            else:
                seen[request_key] = row[0]

        cursor.execute(
            "UPDATE overtime_applications SET active_request_key = ? WHERE id = ?",
            (request_key, row[0]),
        )
        updated += 1

    return updated, duplicates


def create_indexes(cursor: sqlite3.Cursor):
    if not index_exists(cursor, 'idx_leave_applications_active_request_key'):
        cursor.execute(
            "CREATE UNIQUE INDEX idx_leave_applications_active_request_key ON leave_applications(active_request_key)"
        )

    if not index_exists(cursor, 'idx_overtime_applications_active_request_key'):
        cursor.execute(
            "CREATE UNIQUE INDEX idx_overtime_applications_active_request_key ON overtime_applications(active_request_key)"
        )


def print_duplicates(kind: str, duplicates):
    print(f"[ERROR] 发现历史{kind}重复活动申请，无法安全创建唯一索引。")
    for keep_id, duplicate_id, request_key in duplicates[:20]:
        print(f"  - 保留候选记录 #{keep_id} 与重复记录 #{duplicate_id} 冲突，key={request_key}")
    if len(duplicates) > 20:
        print(f"  ... 还有 {len(duplicates) - 20} 条冲突未展示")


def run_migration() -> bool:
    if not os.path.exists(DB_PATH):
        print(f"[ERROR] 数据库文件不存在: {DB_PATH}")
        print(f"   当前工作目录: {os.getcwd()}")
        return False

    backup_path = backup_database(DB_PATH)

    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        ensure_schema(cursor)
        conn.commit()

        leave_updated, leave_duplicates = populate_leave_keys(cursor)
        overtime_updated, overtime_duplicates = populate_overtime_keys(cursor)

        if leave_duplicates:
            conn.rollback()
            print_duplicates('请假', leave_duplicates)
            if backup_path:
                print(f"[INFO] 可从备份恢复: {backup_path}")
            return False

        if overtime_duplicates:
            conn.rollback()
            print_duplicates('加班', overtime_duplicates)
            if backup_path:
                print(f"[INFO] 可从备份恢复: {backup_path}")
            return False

        create_indexes(cursor)
        conn.commit()

        print('[OK] 活动申请去重键迁移完成')
        print(f"[INFO] 已回填请假记录: {leave_updated}")
        print(f"[INFO] 已回填加班记录: {overtime_updated}")
        return True
    except sqlite3.IntegrityError as exc:
        if conn:
            conn.rollback()
        print(f"[ERROR] 创建唯一索引失败: {exc}")
        if backup_path:
            print(f"[INFO] 可从备份恢复: {backup_path}")
        return False
    except Exception as exc:
        if conn:
            conn.rollback()
        print(f"[ERROR] 迁移失败: {exc}")
        import traceback
        traceback.print_exc()
        if backup_path:
            print(f"[INFO] 可从备份恢复: {backup_path}")
        return False
    finally:
        if conn:
            conn.close()


if __name__ == '__main__':
    print('=' * 72)
    print('数据库迁移：为请假/加班申请增加活动去重键与唯一索引')
    print('=' * 72)
    print()

    success = run_migration()

    print()
    if success:
        print('[OK] 迁移成功完成')
        sys.exit(0)

    print('[FAIL] 迁移失败，请先处理历史重复活动申请后再重试')
    sys.exit(1)
