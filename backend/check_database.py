"""
检查数据库是否有 wechat_openid 字段的脚本
运行方式: python backend/check_database.py
"""
import sqlite3
import os

def check_database():
    db_path = "attendance.db"
    
    if not os.path.exists(db_path):
        print(f"❌ 数据库文件 {db_path} 不存在")
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 检查表是否存在
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        if not cursor.fetchone():
            print("❌ users 表不存在")
            conn.close()
            return False
        
        # 检查字段是否存在
        cursor.execute("PRAGMA table_info(users)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if "wechat_openid" in columns:
            print("✅ wechat_openid 字段已存在")
            conn.close()
            return True
        else:
            print("❌ wechat_openid 字段不存在")
            print(f"当前字段: {', '.join(columns)}")
            
            # 询问是否添加字段
            print("\n是否要添加 wechat_openid 字段？(y/n): ", end="")
            response = input().strip().lower()
            
            if response == 'y':
                try:
                    cursor.execute("ALTER TABLE users ADD COLUMN wechat_openid VARCHAR(128)")
                    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wechat_openid ON users(wechat_openid)")
                    conn.commit()
                    print("✅ 成功添加 wechat_openid 字段")
                    conn.close()
                    return True
                except Exception as e:
                    print(f"❌ 添加字段失败: {str(e)}")
                    conn.close()
                    return False
            else:
                conn.close()
                return False
                
    except Exception as e:
        print(f"❌ 检查数据库失败: {str(e)}")
        return False

if __name__ == "__main__":
    print("检查数据库配置...")
    check_database()

