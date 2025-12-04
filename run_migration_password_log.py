#!/usr/bin/env python
"""
创建密码修改日志表的数据库迁移脚本
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
    print("开始数据库迁移：创建密码修改日志表")
    print("=" * 60)
    
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        
        # 检查表是否已存在
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='password_change_logs'"
        )
        if cursor.fetchone():
            print("⚠️  password_change_logs表已存在，跳过迁移")
            conn.close()
            return True
        
        print("\n创建password_change_logs表...")
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
        print("✅ 表创建完成")
        
        print("\n创建索引...")
        cursor.execute(
            "CREATE INDEX idx_password_change_logs_user_id ON password_change_logs(user_id)"
        )
        cursor.execute(
            "CREATE INDEX idx_password_change_logs_created_at ON password_change_logs(created_at)"
        )
        print("✅ 索引创建完成")
        
        # 提交事务
        conn.commit()
        
        # 验证迁移
        print("\n验证迁移结果...")
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='password_change_logs'"
        )
        if cursor.fetchone():
            print("✅ password_change_logs表创建成功")
        else:
            print("❌ password_change_logs表创建失败")
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
