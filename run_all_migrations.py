#!/usr/bin/env python
"""
执行所有数据库迁移的综合脚本
"""
import sqlite3
import sys
from pathlib import Path

def check_table_exists(cursor, table_name):
    """检查表是否存在"""
    cursor.execute(
        f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'"
    )
    return cursor.fetchone() is not None

def check_column_exists(cursor, table_name, column_name):
    """检查列是否存在"""
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = [col[1] for col in cursor.fetchall()]
    return column_name in columns

def run_all_migrations():
    """执行所有迁移"""
    db_path = Path("attendance.db")
    
    if not db_path.exists():
        print(f"❌ 数据库文件不存在: {db_path}")
        return False
    
    print("=" * 70)
    print("开始执行所有数据库迁移")
    print("=" * 70)
    
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        
        migrations_applied = 0
        migrations_skipped = 0
        
        # 迁移1: 添加version字段
        print("\n【迁移1】添加version字段到关键表")
        print("-" * 70)
        
        tables_to_add_version = ['users', 'leave_applications', 'overtime_applications']
        for table in tables_to_add_version:
            if check_column_exists(cursor, table, 'version'):
                print(f"  ⏭️  {table}.version 已存在，跳过")
                migrations_skipped += 1
            else:
                print(f"  ➕ 为 {table} 添加version字段...")
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN version INTEGER DEFAULT 1 NOT NULL")
                cursor.execute(f"UPDATE {table} SET version = 1")
                print(f"  ✅ {table}.version 添加成功")
                migrations_applied += 1
        
        # 迁移2: 创建密码修改日志表
        print("\n【迁移2】创建密码修改日志表")
        print("-" * 70)
        
        if check_table_exists(cursor, 'password_change_logs'):
            print("  ⏭️  password_change_logs表已存在，跳过")
            migrations_skipped += 1
        else:
            print("  ➕ 创建password_change_logs表...")
            cursor.execute("""
                CREATE TABLE password_change_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    changed_by_id INTEGER NOT NULL,
                    ip_address VARCHAR(45),
                    user_agent VARCHAR(255),
                    change_type VARCHAR(20) NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    FOREIGN KEY (changed_by_id) REFERENCES users(id)
                )
            """)
            
            print("  ➕ 创建索引...")
            cursor.execute(
                "CREATE INDEX idx_password_change_logs_user_id ON password_change_logs(user_id)"
            )
            cursor.execute(
                "CREATE INDEX idx_password_change_logs_created_at ON password_change_logs(created_at)"
            )
            print("  ✅ password_change_logs表创建成功")
            migrations_applied += 1
        
        # 迁移3: 添加性能优化索引
        print("\n【迁移3】添加性能优化索引")
        print("-" * 70)
        
        indexes_to_create = [
            ("idx_attendances_user_id", "attendances", "user_id"),
            ("idx_attendances_user_date", "attendances", "user_id, date"),
            ("idx_leave_applications_user_id", "leave_applications", "user_id"),
            ("idx_leave_applications_status", "leave_applications", "status"),
            ("idx_leave_applications_user_status", "leave_applications", "user_id, status"),
            ("idx_overtime_applications_user_id", "overtime_applications", "user_id"),
            ("idx_overtime_applications_status", "overtime_applications", "status"),
            ("idx_overtime_applications_user_status", "overtime_applications", "user_id, status"),
            ("idx_users_department_id", "users", "department_id"),
            ("idx_users_role", "users", "role"),
            ("idx_users_is_active", "users", "is_active"),
        ]
        
        index_created = 0
        index_skipped = 0
        
        for index_name, table_name, columns in indexes_to_create:
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='index' AND name=?",
                (index_name,)
            )
            
            if cursor.fetchone():
                index_skipped += 1
            else:
                print(f"  ➕ 创建索引 {index_name}...")
                cursor.execute(f"CREATE INDEX {index_name} ON {table_name}({columns})")
                index_created += 1
        
        if index_created > 0:
            print(f"  ✅ 创建了 {index_created} 个索引")
            migrations_applied += 1
        else:
            print(f"  ⏭️  所有索引已存在，跳过")
            migrations_skipped += 1
        
        # 提交所有更改
        conn.commit()
        
        # 验证迁移结果
        print("\n" + "=" * 70)
        print("验证迁移结果")
        print("=" * 70)
        
        all_valid = True
        
        # 验证version字段
        for table in tables_to_add_version:
            if check_column_exists(cursor, table, 'version'):
                print(f"✅ {table}.version 字段存在")
            else:
                print(f"❌ {table}.version 字段不存在")
                all_valid = False
        
        # 验证密码日志表
        if check_table_exists(cursor, 'password_change_logs'):
            print("✅ password_change_logs表存在")
        else:
            print("❌ password_change_logs表不存在")
            all_valid = False
        
        # 验证索引
        cursor.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
        )
        index_count = cursor.fetchone()[0]
        print(f"✅ 数据库共有 {index_count} 个自定义索引")
        
        conn.close()
        
        # 总结
        print("\n" + "=" * 70)
        print("迁移执行总结")
        print("=" * 70)
        print(f"✅ 应用的迁移: {migrations_applied}")
        print(f"⏭️  跳过的迁移: {migrations_skipped}")
        print(f"📊 总计: {migrations_applied + migrations_skipped}")
        
        if all_valid:
            print("\n🎉 所有迁移成功完成！")
            print("=" * 70)
            return True
        else:
            print("\n❌ 部分迁移验证失败")
            print("=" * 70)
            return False
        
    except Exception as e:
        print(f"\n❌ 迁移失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = run_all_migrations()
    sys.exit(0 if success else 1)
