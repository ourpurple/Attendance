#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
数据库迁移脚本执行工具
执行 backend/migrations/add_approval_assignment.sql
"""

import sqlite3
import os
import sys
import io

# 设置标准输出编码为 UTF-8（Windows 兼容）
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

def run_migration():
    """执行数据库迁移"""
    db_path = "attendance.db"
    sql_file = "backend/migrations/add_approval_assignment.sql"
    
    print(f"开始执行数据库迁移...")
    print(f"数据库文件: {db_path}")
    print(f"SQL 文件: {sql_file}")
    
    # 检查文件是否存在
    if not os.path.exists(db_path):
        print(f"错误: 数据库文件不存在: {db_path}")
        sys.exit(1)
    
    if not os.path.exists(sql_file):
        print(f"错误: SQL 文件不存在: {sql_file}")
        sys.exit(1)
    
    try:
        # 连接数据库
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 读取 SQL 文件
        with open(sql_file, 'r', encoding='utf-8') as f:
            sql_content = f.read()
        
        # 执行 SQL（使用 executescript 执行多条语句）
        # 注意：SQLite 的 executescript 不支持 IF NOT EXISTS 等语法
        # 需要逐条执行或处理错误
        
        # 分割 SQL 语句（按分号分割，但要注意字符串中的分号）
        statements = []
        current_statement = ""
        in_string = False
        string_char = None
        
        for char in sql_content:
            if char in ("'", '"') and (not current_statement or current_statement[-1] != '\\'):
                if not in_string:
                    in_string = True
                    string_char = char
                elif char == string_char:
                    in_string = False
                    string_char = None
            
            current_statement += char
            
            if not in_string and char == ';':
                stmt = current_statement.strip()
                if stmt and not stmt.startswith('--'):
                    statements.append(stmt)
                current_statement = ""
        
        # 分离 CREATE TABLE、CREATE INDEX 和其他语句
        create_table_statements = []
        create_index_statements = []
        other_statements = []
        
        for stmt in statements:
            stmt_upper = stmt.upper()
            if 'CREATE TABLE' in stmt_upper:
                create_table_statements.append(stmt)
            elif 'CREATE INDEX' in stmt_upper:
                create_index_statements.append(stmt)
            else:
                other_statements.append(stmt)
        
        # 执行顺序：CREATE TABLE -> 其他语句（ALTER TABLE等） -> CREATE INDEX
        all_statements = create_table_statements + other_statements + create_index_statements
        
        # 执行每条语句
        executed = 0
        errors = []
        skipped_indexes = []  # 记录跳过的索引创建语句
        
        for i, statement in enumerate(all_statements, 1):
            statement = statement.strip()
            if not statement or statement.startswith('--'):
                continue
            
            try:
                # 处理 CREATE TABLE IF NOT EXISTS
                if 'CREATE TABLE' in statement.upper():
                    # 提取表名
                    table_name = None
                    if 'vice_president_departments' in statement:
                        table_name = 'vice_president_departments'
                    
                    if table_name:
                        # 检查表是否已存在
                        cursor.execute("""
                            SELECT name FROM sqlite_master 
                            WHERE type='table' AND name=?
                        """, (table_name,))
                        if cursor.fetchone():
                            print(f"  表 {table_name} 已存在，跳过创建")
                            executed += 1  # 也算作执行成功
                            continue
                        else:
                            # 表不存在，需要创建
                            # 移除 IF NOT EXISTS（SQLite 支持，但为了统一处理）
                            create_stmt = statement.replace('IF NOT EXISTS', '').strip()
                            if create_stmt.endswith(';'):
                                create_stmt = create_stmt[:-1]
                            cursor.execute(create_stmt)
                            executed += 1
                            print(f"  [OK] 创建表 {table_name}")
                            continue
                
                # 处理 ALTER TABLE ADD COLUMN
                # SQLite 不支持重复添加列，需要先检查
                if 'ALTER TABLE' in statement.upper() and 'ADD COLUMN' in statement.upper():
                    # 提取表名和列名
                    parts = statement.split()
                    table_idx = parts.index('TABLE') + 1
                    col_idx = parts.index('COLUMN') + 1
                    
                    if table_idx < len(parts) and col_idx < len(parts):
                        table_name = parts[table_idx]
                        col_name = parts[col_idx]
                        
                        # 检查列是否已存在
                        cursor.execute(f"PRAGMA table_info({table_name})")
                        columns = [row[1] for row in cursor.fetchall()]
                        
                        if col_name in columns:
                            print(f"  列 {table_name}.{col_name} 已存在，跳过添加")
                            executed += 1  # 也算作执行成功
                            continue
                
                # 执行语句
                cursor.execute(statement)
                executed += 1
                print(f"  [OK] 执行语句 {i}")
                
            except sqlite3.OperationalError as e:
                error_msg = str(e)
                # 忽略"已存在"的错误
                if 'already exists' in error_msg.lower() or 'duplicate column' in error_msg.lower():
                    print(f"  [SKIP] 语句 {i} 已存在，跳过: {error_msg}")
                    executed += 1  # 也算作执行成功
                elif 'no such table' in error_msg.lower() and 'CREATE INDEX' in statement.upper():
                    # 索引创建时表不存在，跳过（表会在后面创建）
                    print(f"  [SKIP] 语句 {i} 表不存在，稍后重试: {error_msg}")
                    skipped_indexes.append(statement)
                elif 'no such column' in error_msg.lower() and 'CREATE INDEX' in statement.upper():
                    # 索引创建时列不存在，跳过（列会在后面添加）
                    print(f"  [SKIP] 语句 {i} 列不存在，稍后重试: {error_msg}")
                    skipped_indexes.append(statement)
                else:
                    errors.append(f"语句 {i}: {error_msg}")
                    print(f"  [ERROR] 语句 {i} 执行失败: {error_msg}")
        
        # 如果有跳过的索引，现在尝试重新创建（因为表和列应该已经存在了）
        if skipped_indexes:
            print(f"\n尝试创建之前跳过的索引...")
            for idx_stmt in skipped_indexes:
                try:
                    cursor.execute(idx_stmt)
                    executed += 1
                    print(f"  [OK] 成功创建索引")
                except sqlite3.OperationalError as e:
                    error_msg = str(e)
                    if 'already exists' in error_msg.lower():
                        print(f"  [SKIP] 索引已存在，跳过")
                        executed += 1
                    else:
                        errors.append(f"索引创建失败: {error_msg}")
                        print(f"  [ERROR] 索引创建失败: {error_msg}")
        
        # 提交事务
        conn.commit()
        
        print(f"\n迁移完成！")
        print(f"  成功执行: {executed} 条语句")
        if errors:
            print(f"  错误: {len(errors)} 条")
            for error in errors:
                print(f"    - {error}")
        else:
            print(f"  无错误")
        
        # 关闭连接
        conn.close()
        
    except Exception as e:
        print(f"执行迁移时出错: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    run_migration()

