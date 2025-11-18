#!/usr/bin/env python3
"""
签到模块重构数据库迁移脚本
执行 add_attendance_refactor.sql 中的SQL语句
"""
import sqlite3
import os
import sys

def run_migration():
    """执行迁移脚本"""
    db_path = "attendance.db"
    sql_file = "backend/migrations/add_attendance_refactor.sql"
    
    # 检查数据库是否存在
    if not os.path.exists(db_path):
        print(f"❌ 错误: 数据库文件 {db_path} 不存在")
        print("请先运行 python init_db.py 初始化数据库")
        sys.exit(1)
    
    # 检查SQL文件是否存在
    if not os.path.exists(sql_file):
        print(f"❌ 错误: 迁移脚本 {sql_file} 不存在")
        sys.exit(1)
    
    print("=" * 50)
    print("开始执行签到模块重构迁移")
    print("=" * 50)
    
    try:
        # 连接数据库
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 读取SQL文件
        with open(sql_file, 'r', encoding='utf-8') as f:
            sql_content = f.read()
        
        # 分割SQL语句（按分号和换行）
        # 移除注释和空行
        statements = []
        for line in sql_content.split('\n'):
            line = line.strip()
            # 跳过注释和空行
            if line and not line.startswith('--'):
                statements.append(line)
        
        # 合并为完整的SQL语句
        full_sql = '\n'.join(statements)
        
        # 按分号分割SQL语句
        sql_statements = [s.strip() for s in full_sql.split(';') if s.strip()]
        
        # 执行每个SQL语句
        executed_count = 0
        for i, sql in enumerate(sql_statements, 1):
            if not sql:
                continue
            
            try:
                # 检查是否是ALTER TABLE语句，需要先检查字段是否存在
                if sql.upper().startswith('ALTER TABLE'):
                    # 解析表名和字段名
                    parts = sql.split()
                    if len(parts) >= 6:
                        table_name = parts[2]
                        column_name = parts[5]
                        
                        # 检查字段是否已存在
                        cursor.execute(f"PRAGMA table_info({table_name})")
                        columns = [col[1] for col in cursor.fetchall()]
                        
                        if column_name in columns:
                            print(f"⏭️  跳过: {table_name}.{column_name} 字段已存在")
                            continue
                
                # 检查是否是CREATE TABLE语句
                if sql.upper().startswith('CREATE TABLE'):
                    # 检查表是否已存在
                    table_name = sql.split()[2]
                    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
                    if cursor.fetchone():
                        print(f"⏭️  跳过: 表 {table_name} 已存在")
                        continue
                
                # 执行SQL语句
                cursor.execute(sql)
                executed_count += 1
                print(f"✓ 执行语句 {i}: {sql[:50]}...")
                
            except sqlite3.OperationalError as e:
                error_msg = str(e)
                # 忽略"字段已存在"和"表已存在"的错误
                if "duplicate column name" in error_msg.lower() or "already exists" in error_msg.lower():
                    print(f"⏭️  跳过: {error_msg}")
                else:
                    print(f"⚠️  警告: 执行语句 {i} 时出错: {error_msg}")
                    print(f"   SQL: {sql[:100]}...")
        
        # 提交事务
        conn.commit()
        print(f"\n✓ 迁移完成！共执行 {executed_count} 条SQL语句")
        
        # 验证迁移结果
        print("\n验证迁移结果...")
        cursor.execute("PRAGMA table_info(attendances)")
        attendance_columns = [col[1] for col in cursor.fetchall()]
        
        required_columns = ['checkin_status', 'morning_status', 'afternoon_status', 'morning_leave', 'afternoon_leave']
        missing_columns = [col for col in required_columns if col not in attendance_columns]
        
        if missing_columns:
            print(f"⚠️  警告: attendances 表缺少以下字段: {', '.join(missing_columns)}")
        else:
            print("✓ attendances 表字段验证通过")
        
        # 检查checkin_status_configs表
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='checkin_status_configs'")
        if cursor.fetchone():
            cursor.execute("SELECT COUNT(*) FROM checkin_status_configs")
            count = cursor.fetchone()[0]
            print(f"✓ checkin_status_configs 表已创建，包含 {count} 条记录")
        else:
            print("⚠️  警告: checkin_status_configs 表未创建")
        
        # 检查attendance_policies表的新字段
        cursor.execute("PRAGMA table_info(attendance_policies)")
        policy_columns = [col[1] for col in cursor.fetchall()]
        required_policy_columns = ['morning_start_time', 'morning_end_time', 'afternoon_start_time', 'afternoon_end_time']
        missing_policy_columns = [col for col in required_policy_columns if col not in policy_columns]
        
        if missing_policy_columns:
            print(f"⚠️  警告: attendance_policies 表缺少以下字段: {', '.join(missing_policy_columns)}")
        else:
            print("✓ attendance_policies 表字段验证通过")
        
        conn.close()
        print("\n" + "=" * 50)
        print("迁移完成！可以启动服务器了")
        print("=" * 50)
        
    except Exception as e:
        print(f"\n❌ 迁移失败: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    run_migration()

