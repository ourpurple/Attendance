import sqlite3

old_value = "李柳琪"
new_value = "李柳琦"
db_path = "attendance.db"  # 你的数据库文件路径

def replace_in_database(db_path, old_value, new_value):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 获取所有表
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [row[0] for row in cursor.fetchall()]

    for table in tables:
        # 获取表结构
        cursor.execute(f"PRAGMA table_info({table})")
        columns_info = cursor.fetchall()

        for col_info in columns_info:
            col_name = col_info[1]
            col_type = col_info[2].upper()

            # 只操作文本类型列
            if "CHAR" in col_type or "CLOB" in col_type or "TEXT" in col_type or col_type == "":
                print(f"正在处理 {table}.{col_name} ...")

                # 查询包含旧值的记录
                cursor.execute(
                    f"SELECT rowid, {col_name} FROM {table} WHERE {col_name} = ?", (old_value,)
                )
                rows = cursor.fetchall()

                # 更新记录
                for rowid, _ in rows:
                    cursor.execute(
                        f"UPDATE {table} SET {col_name} = ? WHERE rowid = ?",
                        (new_value, rowid)
                    )

    conn.commit()
    conn.close()
    print("批量替换完成！")

if __name__ == "__main__":
    replace_in_database(db_path, old_value, new_value)
