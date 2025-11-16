#!/usr/bin/env python3
"""
审批分配功能数据库迁移脚本
添加副总分管部门表和审批分配字段
"""

import sqlite3
import sys
from pathlib import Path

# 获取项目根目录
project_root = Path(__file__).parent
db_path = project_root / "attendance.db"
migration_sql = project_root / "backend" / "migrations" / "add_approval_assignment.sql"

def check_column_exists(cursor, table_name, column_name):
    """检查表中是否存在指定列"""
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = [row[1] for row in cursor.fetchall()]
    return column_name in columns

def migrate():
    """执行数据库迁移"""
    if not db_path.exists():
        print(f"❌ 数据库文件不存在: {db_path}")
        sys.exit(1)
    
    if not migration_sql.exists():
        print(f"❌ 迁移SQL文件不存在: {migration_sql}")
        sys.exit(1)
    
    print("开始执行数据库迁移...")
    print(f"数据库文件: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # 1. 创建副总分管部门表
        print("\n1. 创建副总分管部门表...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS vice_president_departments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vice_president_id INTEGER NOT NULL,
                department_id INTEGER NOT NULL,
                is_default BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (vice_president_id) REFERENCES users(id),
                FOREIGN KEY (department_id) REFERENCES departments(id),
                UNIQUE(vice_president_id, department_id)
            )
        """)
        print("   ✅ 副总分管部门表创建成功")
        
        # 创建索引
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_vp_dept_vp_id ON vice_president_departments(vice_president_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_vp_dept_dept_id ON vice_president_departments(department_id)")
        print("   ✅ 索引创建成功")
        
        # 2. 为请假申请表添加字段
        print("\n2. 为请假申请表添加字段...")
        
        if not check_column_exists(cursor, "leave_applications", "assigned_vp_id"):
            cursor.execute("ALTER TABLE leave_applications ADD COLUMN assigned_vp_id INTEGER")
            print("   ✅ 添加 assigned_vp_id 字段")
        else:
            print("   ⚠️  assigned_vp_id 字段已存在，跳过")
        
        if not check_column_exists(cursor, "leave_applications", "assigned_gm_id"):
            cursor.execute("ALTER TABLE leave_applications ADD COLUMN assigned_gm_id INTEGER")
            print("   ✅ 添加 assigned_gm_id 字段")
        else:
            print("   ⚠️  assigned_gm_id 字段已存在，跳过")
        
        # 3. 为加班申请表添加字段
        print("\n3. 为加班申请表添加字段...")
        
        if not check_column_exists(cursor, "overtime_applications", "assigned_approver_id"):
            cursor.execute("ALTER TABLE overtime_applications ADD COLUMN assigned_approver_id INTEGER")
            print("   ✅ 添加 assigned_approver_id 字段")
        else:
            print("   ⚠️  assigned_approver_id 字段已存在，跳过")
        
        # 4. 创建索引
        print("\n4. 创建索引...")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_leave_assigned_vp ON leave_applications(assigned_vp_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_leave_assigned_gm ON leave_applications(assigned_gm_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_overtime_assigned_approver ON overtime_applications(assigned_approver_id)")
        print("   ✅ 索引创建成功")
        
        # 提交事务
        conn.commit()
        print("\n✅ 数据库迁移完成！")
        
    except sqlite3.Error as e:
        conn.rollback()
        print(f"\n❌ 数据库迁移失败: {e}")
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()

