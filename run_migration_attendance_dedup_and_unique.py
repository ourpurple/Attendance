#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据库迁移脚本：清理历史重复考勤记录并新增唯一索引
规则：同一用户同一天保留一条，采用“最早签到 + 最晚签退”合并
"""
import os
import sys
import sqlite3
from datetime import datetime


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


def count_duplicate_user_day(cursor: sqlite3.Cursor) -> int:
    cursor.execute(
        """
        SELECT COUNT(*)
        FROM (
            SELECT user_id, date(date) AS day, COUNT(*) AS cnt
            FROM attendances
            GROUP BY user_id, day
            HAVING cnt > 1
        ) t
        """
    )
    return int(cursor.fetchone()[0])


def count_total_attendances(cursor: sqlite3.Cursor) -> int:
    cursor.execute("SELECT COUNT(*) FROM attendances")
    return int(cursor.fetchone()[0])


def unique_index_exists(cursor: sqlite3.Cursor) -> bool:
    cursor.execute(
        """
        SELECT 1
        FROM sqlite_master
        WHERE type = 'index'
          AND name = 'idx_attendances_user_date_unique'
        """
    )
    return cursor.fetchone() is not None


def run_migration() -> bool:
    db_path = 'attendance.db'
    dedup_sql_path = 'backend/migrations/dedup_attendances_user_day.sql'
    unique_sql_path = 'backend/migrations/add_attendance_user_date_unique_index.sql'

    if not os.path.exists(db_path):
        print(f"[ERROR] 数据库文件不存在: {db_path}")
        print(f"   当前工作目录: {os.getcwd()}")
        return False

    for path in (dedup_sql_path, unique_sql_path):
        if not os.path.exists(path):
            print(f"[ERROR] 迁移脚本不存在: {path}")
            print(f"   当前工作目录: {os.getcwd()}")
            return False

    print("[STEP] 正在备份数据库...")
    backup_path = backup_database(db_path)

    conn = None
    try:
        print("[STEP] 正在连接数据库...")
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        before_total = count_total_attendances(cursor)
        before_dup_groups = count_duplicate_user_day(cursor)

        print(f"[INFO] 迁移前：考勤记录总数 = {before_total}, 重复用户日组数 = {before_dup_groups}")

        print("[STEP] 正在读取去重脚本...")
        with open(dedup_sql_path, 'r', encoding='utf-8') as f:
            dedup_sql = f.read()

        print("[STEP] 正在执行去重...")
        cursor.executescript(dedup_sql)
        conn.commit()

        mid_total = count_total_attendances(cursor)
        mid_dup_groups = count_duplicate_user_day(cursor)
        print(f"[INFO] 去重后：考勤记录总数 = {mid_total}, 重复用户日组数 = {mid_dup_groups}")

        if mid_dup_groups != 0:
            print("[ERROR] 去重后仍存在重复用户日数据，终止索引创建")
            return False

        print("[STEP] 正在读取唯一索引脚本...")
        with open(unique_sql_path, 'r', encoding='utf-8') as f:
            unique_sql = f.read()

        print("[STEP] 正在创建唯一索引...")
        cursor.executescript(unique_sql)
        conn.commit()

        if not unique_index_exists(cursor):
            print("[ERROR] 唯一索引创建失败")
            return False

        after_total = count_total_attendances(cursor)
        after_dup_groups = count_duplicate_user_day(cursor)
        print(f"[INFO] 最终状态：考勤记录总数 = {after_total}, 重复用户日组数 = {after_dup_groups}")
        print("[OK] 唯一索引 idx_attendances_user_date_unique 已存在")

        print("\n[OK] 迁移完成！")
        if backup_path:
            print(f"[BACKUP] 备份文件: {backup_path}")
        return True

    except sqlite3.IntegrityError as exc:
        print(f"[ERROR] 迁移失败：数据完整性错误: {exc}")
        if backup_path:
            print(f"[BACKUP] 可以从备份恢复: {backup_path}")
        return False
    except sqlite3.OperationalError as exc:
        print(f"[ERROR] 迁移失败：数据库操作错误: {exc}")
        if backup_path:
            print(f"[BACKUP] 可以从备份恢复: {backup_path}")
        return False
    except Exception as exc:
        print(f"[ERROR] 迁移执行失败: {exc}")
        import traceback
        traceback.print_exc()
        if backup_path:
            print(f"[BACKUP] 可以从备份恢复: {backup_path}")
        return False
    finally:
        if conn is not None:
            conn.close()


if __name__ == '__main__':
    print('=' * 72)
    print('数据库迁移：考勤去重 + 唯一索引')
    print('规则：最早签到 + 最晚签退')
    print('=' * 72)
    print()

    success = run_migration()

    print()
    if success:
        print('[OK] 迁移成功完成！')
        sys.exit(0)

    print('[ERROR] 迁移失败，请检查错误信息')
    sys.exit(1)
