#!/usr/bin/env python
"""
添加数据库索引的迁移脚本
优化查询性能
"""
import sqlite3
import sys
from pathlib import Path

def run_migration():
    """执行迁移"""
    db_path = Path("attendance.db")
    
    if not db_path.exists():
        print(f"❌ 数据库文件不存在: {db_path}")
        return False
    
    print("=" * 60)
    print("开始数据库迁移：添加性能优化索引")
    print("=" * 60)
    
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        
        indexes_to_create = [
            # attendances表索引
            ("idx_attendances_user_id", "attendances", "user_id"),
            ("idx_attendances_user_date", "attendances", "user_id, date"),
            
            # leave_applications表索引
            ("idx_leave_applications_user_id", "leave_applications", "user_id"),
            ("idx_leave_applications_status", "leave_applications", "status"),
            ("idx_leave_applications_user_status", "leave_applications", "user_id, status"),
            
            # overtime_applications表索引
            ("idx_overtime_applications_user_id", "overtime_applications", "user_id"),
            ("idx_overtime_applications_status", "overtime_applications", "status"),
            ("idx_overtime_applications_user_status", "overtime_applications", "user_id, status"),
            
            # users表索引
            ("idx_users_department_id", "users", "department_id"),
            ("idx_users_role", "users", "role"),
            ("idx_users_is_active", "users", "is_active"),
        ]
        
        created_count = 0
        skipped_count = 0
        
        for index_name, table_name, columns in indexes_to_create:
            # 检查索引是否已存在
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='index' AND name=?",
                (index_name,)
            )
            
            if cursor.fetchone():
                print(f"⏭️  索引 {index_name} 已存在，跳过")
                skipped_count += 1
            else:
                print(f"➕ 创建索引 {index_name} on {table_name}({columns})...")
                cursor.execute(
                    f"CREATE INDEX {index_name} ON {table_name}({columns})"
                )
                print(f"✅ 索引 {index_name} 创建成功")
                created_count += 1
        
        # 提交事务
        conn.commit()
        
        # 验证索引
        print("\n验证索引创建结果...")
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
        )
        indexes = cursor.fetchall()
        print(f"✅ 当前数据库共有 {len(indexes)} 个自定义索引")
        
        conn.close()
        
        print("\n" + "=" * 60)
        print("迁移执行总结")
        print("=" * 60)
        print(f"✅ 创建的索引: {created_count}")
        print(f"⏭️  跳过的索引: {skipped_count}")
        print(f"📊 总计: {created_count + skipped_count}")
        print("\n🎉 数据库索引迁移成功完成！")
        print("=" * 60)
        return True
        
    except Exception as e:
        print(f"\n❌ 迁移失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)
