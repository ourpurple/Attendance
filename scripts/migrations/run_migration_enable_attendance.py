#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据库迁移脚本：添加 enable_attendance 字段
跨平台脚本，支持 Windows 和 Linux 系统
"""
import sqlite3
import os
import sys
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]

def backup_database(db_path):
    """备份数据库"""
    if not os.path.exists(db_path):
        print(f"❌ 数据库文件不存在: {db_path}")
        return None
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = f"{db_path}.backup.{timestamp}"
    
    try:
        import shutil
        shutil.copy2(db_path, backup_path)
        print(f"✅ 数据库已备份到: {backup_path}")
        return backup_path
    except Exception as e:
        print(f"⚠️  备份失败: {str(e)}")
        return None

def run_migration():
    """执行数据库迁移"""
    db_path = str(PROJECT_ROOT / 'attendance.db')
    migration_path = str(PROJECT_ROOT / 'backend' / 'migrations' / 'add_enable_attendance_flag.sql')
    
    # 检查文件是否存在
    if not os.path.exists(db_path):
        print(f"❌ 数据库文件不存在: {db_path}")
        print(f"   当前工作目录: {os.getcwd()}")
        return False
    
    if not os.path.exists(migration_path):
        print(f"❌ 迁移脚本不存在: {migration_path}")
        print(f"   当前工作目录: {os.getcwd()}")
        return False
    
    # 备份数据库
    print("📦 正在备份数据库...")
    backup_path = backup_database(db_path)
    
    try:
        # 连接数据库
        print("🔌 正在连接数据库...")
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 检查字段是否已存在
        cursor.execute('PRAGMA table_info(users)')
        columns = cursor.fetchall()
        column_names = [col[1] for col in columns]
        
        if 'enable_attendance' in column_names:
            print("ℹ️  enable_attendance 字段已存在，跳过迁移")
            conn.close()
            return True
        
        # 读取迁移脚本
        print("📖 正在读取迁移脚本...")
        with open(migration_path, 'r', encoding='utf-8') as f:
            migration_sql = f.read()
        
        # 执行迁移
        print("⚙️  正在执行迁移...")
        cursor.executescript(migration_sql)
        conn.commit()
        
        print("✅ 数据库迁移执行成功")
        
        # 验证结果
        cursor.execute('PRAGMA table_info(users)')
        columns = cursor.fetchall()
        
        enable_attendance_exists = any(col[1] == 'enable_attendance' for col in columns)
        if enable_attendance_exists:
            print("✅ enable_attendance 字段已成功添加")
            
            # 检查现有数据的默认值
            cursor.execute('SELECT COUNT(*) FROM users WHERE enable_attendance IS NULL')
            null_count = cursor.fetchone()[0]
            if null_count == 0:
                print("✅ 所有现有用户已设置为默认开启考勤管理")
            else:
                print(f"⚠️  仍有 {null_count} 个用户的 enable_attendance 为 NULL")
                # 再次执行更新
                cursor.execute('UPDATE users SET enable_attendance = 1 WHERE enable_attendance IS NULL')
                conn.commit()
                print("✅ 已更新 NULL 值")
            
            # 显示统计信息
            cursor.execute('SELECT COUNT(*) FROM users WHERE enable_attendance = 1')
            enabled_count = cursor.fetchone()[0]
            cursor.execute('SELECT COUNT(*) FROM users WHERE enable_attendance = 0')
            disabled_count = cursor.fetchone()[0]
            cursor.execute('SELECT COUNT(*) FROM users')
            total_count = cursor.fetchone()[0]
            
            print(f"\n📊 统计信息:")
            print(f"   总用户数: {total_count}")
            print(f"   开启考勤: {enabled_count}")
            print(f"   关闭考勤: {disabled_count}")
        else:
            print("❌ enable_attendance 字段未找到")
            conn.close()
            return False
            
        conn.close()
        print("\n✅ 迁移完成！")
        if backup_path:
            print(f"💾 备份文件: {backup_path}")
        return True
        
    except sqlite3.OperationalError as e:
        if 'duplicate column name' in str(e).lower():
            print("ℹ️  字段已存在，迁移已完成")
            return True
        else:
            print(f"❌ 数据库操作失败: {str(e)}")
            if backup_path:
                print(f"💾 可以从备份恢复: {backup_path}")
            return False
    except Exception as e:
        print(f"❌ 迁移执行失败: {str(e)}")
        import traceback
        traceback.print_exc()
        if backup_path:
            print(f"💾 可以从备份恢复: {backup_path}")
        return False

if __name__ == '__main__':
    print("=" * 60)
    print("数据库迁移：添加 enable_attendance 字段")
    print("跨平台脚本 - 支持 Windows 和 Linux")
    print("=" * 60)
    print()
    
    success = run_migration()
    
    print()
    if success:
        print("✅ 迁移成功完成！")
        print("   现在可以启动后端服务: python run.py")
        sys.exit(0)
    else:
        print("❌ 迁移失败，请检查错误信息")
        sys.exit(1)

