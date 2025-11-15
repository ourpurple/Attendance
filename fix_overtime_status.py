#!/usr/bin/env python3
"""
修复加班状态大小写问题
将数据库中的大写状态改为小写
"""
import sqlite3

def fix_status():
    """修复状态值"""
    conn = sqlite3.connect('attendance.db')
    cursor = conn.cursor()
    
    print("=" * 60)
    print("修复加班状态大小写")
    print("=" * 60)
    
    # 1. 查看当前状态
    print("\n修复前的状态：")
    cursor.execute("SELECT id, status FROM overtime_applications")
    before = cursor.fetchall()
    for row in before:
        print(f"  ID {row[0]}: {row[1]}")
    
    # 2. 修复状态值（转换为小写）
    print("\n开始修复...")
    cursor.execute("""
        UPDATE overtime_applications 
        SET status = LOWER(status)
        WHERE status != LOWER(status)
    """)
    
    affected = cursor.rowcount
    print(f"  修改了 {affected} 条记录")
    
    # 3. 查看修复后的状态
    print("\n修复后的状态：")
    cursor.execute("SELECT id, status FROM overtime_applications")
    after = cursor.fetchall()
    for row in after:
        print(f"  ID {row[0]}: {row[1]}")
    
    # 4. 统计已批准的加班
    print("\n统计已批准的加班：")
    cursor.execute("""
        SELECT 
            u.real_name,
            COUNT(*) as count,
            SUM(o.days) as total_days
        FROM overtime_applications o
        JOIN users u ON o.user_id = u.id
        WHERE o.status = 'approved'
        GROUP BY u.id
    """)
    stats = cursor.fetchall()
    if stats:
        for stat in stats:
            print(f"  {stat[0]}: {stat[2]} 天 ({stat[1]} 次)")
    else:
        print("  没有找到已批准的记录")
    
    # 提交更改
    conn.commit()
    conn.close()
    
    print("\n" + "=" * 60)
    print("修复完成！")
    print("=" * 60)

if __name__ == "__main__":
    try:
        fix_status()
    except Exception as e:
        print(f"错误: {e}")
        import traceback
        traceback.print_exc()


