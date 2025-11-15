"""
数据库迁移脚本：添加每周打卡规则功能
为 attendance_policies 表添加 weekly_rules 字段
"""
import sqlite3
import sys

def migrate():
    """执行迁移"""
    try:
        # 连接数据库
        conn = sqlite3.connect('attendance.db')
        cursor = conn.cursor()
        
        # 检查字段是否已存在
        cursor.execute("PRAGMA table_info(attendance_policies)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'weekly_rules' in columns:
            print("✓ weekly_rules 字段已存在，无需迁移")
            conn.close()
            return True
        
        print("开始迁移...")
        
        # 添加 weekly_rules 字段
        cursor.execute("""
            ALTER TABLE attendance_policies 
            ADD COLUMN weekly_rules TEXT
        """)
        
        conn.commit()
        print("✓ 成功添加 weekly_rules 字段")
        
        # 验证
        cursor.execute("PRAGMA table_info(attendance_policies)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'weekly_rules' in columns:
            print("✓ 迁移验证成功")
            conn.close()
            return True
        else:
            print("✗ 迁移验证失败")
            conn.close()
            return False
            
    except sqlite3.Error as e:
        print(f"✗ 数据库错误: {e}")
        return False
    except Exception as e:
        print(f"✗ 迁移失败: {e}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("数据库迁移：添加每周打卡规则功能")
    print("=" * 60)
    
    success = migrate()
    
    if success:
        print("\n" + "=" * 60)
        print("✓ 迁移完成！")
        print("=" * 60)
        print("\n现在可以重启服务器：")
        print("  python run.py")
        sys.exit(0)
    else:
        print("\n" + "=" * 60)
        print("✗ 迁移失败！")
        print("=" * 60)
        print("\n如果问题持续，请尝试：")
        print("  1. 检查 attendance.db 文件是否存在")
        print("  2. 备份数据后重新初始化数据库：python init_db.py")
        sys.exit(1)


