#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据库迁移脚本：清理历史重复考勤记录并新增唯一索引
规则：同一用户同一天保留一条，采用“最早签到 + 最晚签退”合并

兼容性说明：
- 优先执行 SQL 去重脚本（性能更好）
- 若目标 SQLite 不支持 WITH / ROW_NUMBER 等语法，会自动回退到 Python 兼容去重逻辑
"""
import os
import sys
import sqlite3
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


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


def get_attendance_columns(cursor: sqlite3.Cursor):
    cursor.execute("PRAGMA table_info(attendances)")
    return {row["name"] for row in cursor.fetchall()}


def first_non_null(*values, default=None):
    for value in values:
        if value is not None:
            return value
    return default


def row_value(row, key: str):
    if row is None:
        return None
    try:
        return row[key]
    except Exception:
        return None


def calc_hours(cursor: sqlite3.Cursor, checkin_time, checkout_time):
    if not checkin_time or not checkout_time:
        return None
    cursor.execute(
        "SELECT ROUND((julianday(?) - julianday(?)) * 24.0, 2)",
        (checkout_time, checkin_time)
    )
    data = cursor.fetchone()
    if not data:
        return None
    return data[0]


def dedup_attendances_compatible(cursor: sqlite3.Cursor):
    """
    不依赖 CTE / WINDOW FUNCTION 的兼容去重。
    """
    columns = get_attendance_columns(cursor)

    required_cols = {"id", "user_id", "date"}
    missing_required = required_cols - columns
    if missing_required:
        raise RuntimeError(f"attendances 缺少关键字段: {sorted(missing_required)}")

    optional_cols = [
        "checkin_time",
        "checkout_time",
        "checkin_location",
        "checkin_latitude",
        "checkin_longitude",
        "checkout_location",
        "checkout_latitude",
        "checkout_longitude",
        "is_late",
        "is_early_leave",
        "work_hours",
        "checkin_status",
        "morning_status",
        "afternoon_status",
        "morning_leave",
        "afternoon_leave",
    ]
    select_cols = ["id", "user_id", "date"] + [c for c in optional_cols if c in columns]

    cursor.execute(
        """
        SELECT user_id, date(date) AS day, COUNT(*) AS cnt
        FROM attendances
        GROUP BY user_id, day
        HAVING cnt > 1
        ORDER BY user_id, day
        """
    )
    dup_groups = cursor.fetchall()

    merged_group_count = 0
    deleted_row_count = 0

    for group in dup_groups:
        user_id = group["user_id"]
        day = group["day"]

        cursor.execute(
            f"""
            SELECT {', '.join(select_cols)}
            FROM attendances
            WHERE user_id = ?
              AND date(date) = ?
            ORDER BY id ASC
            """,
            (user_id, day)
        )
        rows = cursor.fetchall()
        if len(rows) <= 1:
            continue

        keep_row = rows[0]
        keep_id = keep_row["id"]

        # 最早签到 / 最晚签退（仅在字段存在时处理）
        min_checkin = None
        max_checkout = None

        checkin_row = None
        checkout_row = None

        if "checkin_time" in columns:
            cursor.execute(
                """
                SELECT *
                FROM attendances
                WHERE user_id = ?
                  AND date(date) = ?
                  AND checkin_time IS NOT NULL
                ORDER BY checkin_time ASC, id ASC
                LIMIT 1
                """,
                (user_id, day)
            )
            checkin_row = cursor.fetchone()

            cursor.execute(
                """
                SELECT MIN(checkin_time)
                FROM attendances
                WHERE user_id = ?
                  AND date(date) = ?
                  AND checkin_time IS NOT NULL
                """,
                (user_id, day)
            )
            min_checkin = cursor.fetchone()[0]

        if "checkout_time" in columns:
            cursor.execute(
                """
                SELECT *
                FROM attendances
                WHERE user_id = ?
                  AND date(date) = ?
                  AND checkout_time IS NOT NULL
                ORDER BY checkout_time DESC, id ASC
                LIMIT 1
                """,
                (user_id, day)
            )
            checkout_row = cursor.fetchone()

            cursor.execute(
                """
                SELECT MAX(checkout_time)
                FROM attendances
                WHERE user_id = ?
                  AND date(date) = ?
                  AND checkout_time IS NOT NULL
                """,
                (user_id, day)
            )
            max_checkout = cursor.fetchone()[0]

        merged = {}

        if "checkin_time" in columns:
            merged["checkin_time"] = min_checkin
        if "checkout_time" in columns:
            merged["checkout_time"] = max_checkout

        if "checkin_location" in columns:
            merged["checkin_location"] = first_non_null(
                row_value(checkin_row, "checkin_location"),
                row_value(keep_row, "checkin_location")
            )
        if "checkin_latitude" in columns:
            merged["checkin_latitude"] = first_non_null(
                row_value(checkin_row, "checkin_latitude"),
                row_value(keep_row, "checkin_latitude")
            )
        if "checkin_longitude" in columns:
            merged["checkin_longitude"] = first_non_null(
                row_value(checkin_row, "checkin_longitude"),
                row_value(keep_row, "checkin_longitude")
            )

        if "checkout_location" in columns:
            merged["checkout_location"] = first_non_null(
                row_value(checkout_row, "checkout_location"),
                row_value(keep_row, "checkout_location")
            )
        if "checkout_latitude" in columns:
            merged["checkout_latitude"] = first_non_null(
                row_value(checkout_row, "checkout_latitude"),
                row_value(keep_row, "checkout_latitude")
            )
        if "checkout_longitude" in columns:
            merged["checkout_longitude"] = first_non_null(
                row_value(checkout_row, "checkout_longitude"),
                row_value(keep_row, "checkout_longitude")
            )

        if "is_late" in columns:
            merged["is_late"] = first_non_null(
                row_value(checkin_row, "is_late"),
                row_value(keep_row, "is_late"),
                default=0
            )
        if "is_early_leave" in columns:
            merged["is_early_leave"] = first_non_null(
                row_value(checkout_row, "is_early_leave"),
                row_value(keep_row, "is_early_leave"),
                default=0
            )

        if "work_hours" in columns:
            calculated_hours = calc_hours(cursor, min_checkin, max_checkout)
            merged["work_hours"] = first_non_null(
                calculated_hours,
                row_value(checkout_row, "work_hours"),
                row_value(keep_row, "work_hours")
            )

        if "checkin_status" in columns:
            merged["checkin_status"] = first_non_null(
                row_value(checkin_row, "checkin_status"),
                row_value(keep_row, "checkin_status")
            )
        if "morning_status" in columns:
            merged["morning_status"] = first_non_null(
                row_value(checkin_row, "morning_status"),
                row_value(keep_row, "morning_status")
            )
        if "afternoon_status" in columns:
            merged["afternoon_status"] = first_non_null(
                row_value(checkout_row, "afternoon_status"),
                row_value(keep_row, "afternoon_status")
            )

        if "morning_leave" in columns:
            merged["morning_leave"] = first_non_null(
                row_value(checkin_row, "morning_leave"),
                row_value(keep_row, "morning_leave"),
                default=0
            )
        if "afternoon_leave" in columns:
            merged["afternoon_leave"] = first_non_null(
                row_value(checkout_row, "afternoon_leave"),
                row_value(keep_row, "afternoon_leave"),
                default=0
            )

        if merged:
            set_clause = ", ".join([f"{key} = ?" for key in merged.keys()])
            params = list(merged.values())
            params.append(keep_id)
            cursor.execute(f"UPDATE attendances SET {set_clause} WHERE id = ?", params)

        delete_ids = [row["id"] for row in rows if row["id"] != keep_id]
        if delete_ids:
            placeholders = ",".join(["?"] * len(delete_ids))
            cursor.execute(f"DELETE FROM attendances WHERE id IN ({placeholders})", delete_ids)
            deleted_row_count += len(delete_ids)

        merged_group_count += 1

    return merged_group_count, deleted_row_count


def supports_advanced_dedup_sql_error(exc: sqlite3.OperationalError) -> bool:
    msg = str(exc).lower()
    return (
        'near "with"' in msg
        or "near 'with'" in msg
        or 'row_number' in msg
    )


def run_migration() -> bool:
    db_path = str(PROJECT_ROOT / 'attendance.db')
    dedup_sql_path = str(PROJECT_ROOT / 'backend' / 'migrations' / 'dedup_attendances_user_day.sql')
    unique_sql_path = str(PROJECT_ROOT / 'backend' / 'migrations' / 'add_attendance_user_date_unique_index.sql')

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
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        print(f"[INFO] SQLite 版本: {sqlite3.sqlite_version}")

        before_total = count_total_attendances(cursor)
        before_dup_groups = count_duplicate_user_day(cursor)

        print(f"[INFO] 迁移前：考勤记录总数 = {before_total}, 重复用户日组数 = {before_dup_groups}")

        force_compat = os.getenv("ATTENDANCE_DEDUP_FORCE_COMPAT", "").strip().lower() in {
            "1", "true", "yes", "on"
        }

        if force_compat:
            print("[STEP] 检测到 ATTENDANCE_DEDUP_FORCE_COMPAT，启用兼容去重模式...")
            merged_groups, deleted_rows = dedup_attendances_compatible(cursor)
            conn.commit()
            print(f"[INFO] 兼容去重完成：处理重复组 = {merged_groups}, 删除记录 = {deleted_rows}")
        else:
            print("[STEP] 正在读取去重脚本...")
            with open(dedup_sql_path, 'r', encoding='utf-8') as f:
                dedup_sql = f.read()

            print("[STEP] 正在执行去重...")
            try:
                cursor.executescript(dedup_sql)
                conn.commit()
            except sqlite3.OperationalError as dedup_exc:
                if supports_advanced_dedup_sql_error(dedup_exc):
                    print(f"[WARN] SQL 去重脚本在当前 SQLite 上不可用: {dedup_exc}")
                    print("[STEP] 正在回退到兼容去重模式...")
                    conn.rollback()
                    merged_groups, deleted_rows = dedup_attendances_compatible(cursor)
                    conn.commit()
                    print(f"[INFO] 兼容去重完成：处理重复组 = {merged_groups}, 删除记录 = {deleted_rows}")
                else:
                    raise

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
