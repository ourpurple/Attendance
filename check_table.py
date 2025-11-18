#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""检查数据库表是否存在"""
import sqlite3
import os
import sys

# 设置输出编码
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

db_path = "attendance.db"

if not os.path.exists(db_path):
    print(f"❌ 数据库文件 {db_path} 不存在")
    exit(1)

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 检查checkin_status_configs表
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='checkin_status_configs'")
    if cursor.fetchone():
        print("✓ checkin_status_configs 表存在")
        
        # 检查表中的数据
        cursor.execute("SELECT COUNT(*) FROM checkin_status_configs")
        count = cursor.fetchone()[0]
        print(f"  表中记录数: {count}")
        
        if count > 0:
            cursor.execute("SELECT id, name, code FROM checkin_status_configs")
            rows = cursor.fetchall()
            print("  数据:")
            for row in rows:
                print(f"    - ID: {row[0]}, 名称: {row[1]}, 代码: {row[2]}")
    else:
        print("❌ checkin_status_configs 表不存在")
        print("  需要运行迁移脚本: python migrate_attendance_refactor.py")
    
    # 检查attendances表的新字段
    cursor.execute("PRAGMA table_info(attendances)")
    columns = [col[1] for col in cursor.fetchall()]
    required_fields = ['checkin_status', 'morning_status', 'afternoon_status', 'morning_leave', 'afternoon_leave']
    missing_fields = [f for f in required_fields if f not in columns]
    
    if missing_fields:
        print(f"\n⚠️  attendances 表缺少字段: {', '.join(missing_fields)}")
        print("  需要运行迁移脚本: python migrate_attendance_refactor.py")
    else:
        print(f"\n✓ attendances 表字段完整")
    
    conn.close()
except Exception as e:
    print(f"❌ 检查失败: {e}")
    import traceback
    traceback.print_exc()

