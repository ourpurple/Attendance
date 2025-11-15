#!/usr/bin/env python3
"""
重新创建数据库
删除旧数据库并重新初始化
"""
import os
import sys

def recreate_database():
    """重新创建数据库"""
    db_file = 'attendance.db'
    
    print("=" * 60)
    print("重新创建数据库")
    print("=" * 60)
    
    # 1. 删除旧数据库
    if os.path.exists(db_file):
        print(f"\n删除旧数据库文件: {db_file}")
        os.remove(db_file)
        print("✓ 已删除")
    else:
        print(f"\n数据库文件不存在: {db_file}")
    
    # 2. 重新初始化
    print("\n重新初始化数据库...")
    from init_db import create_initial_data
    from backend.database import init_db
    
    try:
        # 创建表结构
        init_db()
        print("✓ 数据库表结构创建完成")
        
        # 创建初始数据
        create_initial_data()
        
        print("\n" + "=" * 60)
        print("数据库重新创建完成！")
        print("=" * 60)
        print("\n提示：")
        print("  - 所有旧数据已被清除")
        print("  - 已创建新的用户和部门数据")
        print("  - 请重启服务器: python run.py")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n✗ 初始化失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    recreate_database()


