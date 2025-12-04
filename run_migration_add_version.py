#!/usr/bin/env python
"""
添加version字段的数据库迁移脚本
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
    print("开始数据库迁移：添加version字段")
    print("=" * 60)
    
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        
        # 检查是否已经有version字段
        cursor.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'version' in columns:
            print("⚠️  version字段已存在，跳过迁移")
            conn.close()
            return True
        
        print("\n1. 为users表添加version字段...")
        cursor.execute("ALTER TABLE users ADD COLUMN version INTEGER DEFAULT 1 NOT NULL")
        cursor.execute("UPDATE users SET version = 1")
        print("✅ users表迁移完成")
        
        print("\n2. 为leave_applications表添加version字段...")
        cursor.execute("ALTER TABLE leave_applications ADD COLUMN version INTEGER DEFAULT 1 NOT NULL")
        cursor.execute("UPDATE leave_applications SET version = 1")
        print("✅ leave_applications表迁移完成")
        
        print("\n3. 为overtime_applications表添加version字段...")
        cursor.execute("ALTER TABLE overtime_applications ADD COLUMN version INTEGER DEFAULT 1 NOT NULL")
        cursor.execute("UPDATE overtime_applications SET version = 1")
        print("✅ overtime_applications表迁移完成")
        
        # 提交事务
        conn.commit()
        
        # 验证迁移
        print("\n验证迁移结果...")
        for table in ['users', 'leave_applications', 'overtime_applications']:
            cursor.execute(f"PRAGMA table_info({table})")
            columns = [col[1] for col in cursor.fetchall()]
            if 'version' in columns:
                print(f"✅ {table}表version字段已添加")
            else:
                print(f"❌ {table}表version字段添加失败")
                conn.close()
                return False
        
        conn.close()
        
        print("\n" + "=" * 60)
        print("✅ 数据库迁移成功完成！")
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
