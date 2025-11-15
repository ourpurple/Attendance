#!/usr/bin/env python3
"""
检查加班数据诊断脚本
用于排查加班统计不准确的问题
"""
import sqlite3
from datetime import datetime

def check_overtime_data():
    """检查数据库中的加班数据"""
    conn = sqlite3.connect('attendance.db')
    cursor = conn.cursor()
    
    print("=" * 80)
    print("加班数据诊断报告")
    print("=" * 80)
    
    # 1. 检查所有加班申请
    print("\n1. 所有加班申请记录：")
    print("-" * 80)
    cursor.execute("""
        SELECT 
            o.id,
            u.real_name,
            u.username,
            o.start_time,
            o.end_time,
            o.hours,
            o.days,
            o.status,
            o.created_at
        FROM overtime_applications o
        JOIN users u ON o.user_id = u.id
        ORDER BY o.created_at DESC
    """)
    
    overtimes = cursor.fetchall()
    if overtimes:
        print(f"{'ID':<5} {'姓名':<10} {'用户名':<10} {'开始时间':<20} {'结束时间':<20} {'小时':<8} {'天数':<8} {'状态':<12} {'创建时间':<20}")
        print("-" * 80)
        for ot in overtimes:
            print(f"{ot[0]:<5} {ot[1]:<10} {ot[2]:<10} {ot[3]:<20} {ot[4]:<20} {ot[5]:<8} {ot[6]:<8} {ot[7]:<12} {ot[8]:<20}")
    else:
        print("没有加班申请记录")
    
    # 2. 按用户统计已批准的加班
    print("\n2. 按用户统计已批准的加班（所有时间）：")
    print("-" * 80)
    cursor.execute("""
        SELECT 
            u.real_name,
            u.username,
            COUNT(*) as count,
            SUM(o.days) as total_days,
            SUM(o.hours) as total_hours
        FROM overtime_applications o
        JOIN users u ON o.user_id = u.id
        WHERE o.status = 'approved'
        GROUP BY u.id
        ORDER BY total_days DESC
    """)
    
    stats = cursor.fetchall()
    if stats:
        print(f"{'姓名':<10} {'用户名':<10} {'申请次数':<10} {'总天数':<10} {'总小时数':<10}")
        print("-" * 80)
        for stat in stats:
            print(f"{stat[0]:<10} {stat[1]:<10} {stat[2]:<10} {stat[3]:<10} {stat[4]:<10}")
    else:
        print("没有已批准的加班记录")
    
    # 3. 检查特定用户（杨娟）的详细数据
    print("\n3. 杨娟的加班详细记录：")
    print("-" * 80)
    cursor.execute("""
        SELECT 
            o.id,
            o.start_time,
            o.end_time,
            o.hours,
            o.days,
            o.status,
            o.reason,
            o.created_at
        FROM overtime_applications o
        JOIN users u ON o.user_id = u.id
        WHERE u.real_name = '杨娟' OR u.username = '杨娟'
        ORDER BY o.created_at DESC
    """)
    
    yangjuan_ot = cursor.fetchall()
    if yangjuan_ot:
        print(f"{'ID':<5} {'开始时间':<20} {'结束时间':<20} {'小时':<8} {'天数':<8} {'状态':<12} {'原因':<20}")
        print("-" * 80)
        for ot in yangjuan_ot:
            print(f"{ot[0]:<5} {ot[1]:<20} {ot[2]:<20} {ot[3]:<8} {ot[4]:<8} {ot[5]:<12} {ot[6]:<20}")
        
        # 计算杨娟已批准的总加班天数
        approved = [ot for ot in yangjuan_ot if ot[5] == 'approved']
        if approved:
            total_days = sum(ot[4] for ot in approved)
            print(f"\n杨娟已批准的加班总天数: {total_days}")
    else:
        print("没有找到杨娟的加班记录")
    
    # 4. 检查11月份的加班数据
    print("\n4. 2025年11月的加班统计：")
    print("-" * 80)
    cursor.execute("""
        SELECT 
            u.real_name,
            u.username,
            COUNT(*) as count,
            SUM(o.days) as total_days,
            GROUP_CONCAT(DATE(o.start_time) || '(' || o.days || '天)') as dates
        FROM overtime_applications o
        JOIN users u ON o.user_id = u.id
        WHERE o.status = 'approved'
          AND DATE(o.start_time) >= '2025-11-01'
          AND DATE(o.start_time) <= '2025-11-30'
        GROUP BY u.id
        ORDER BY total_days DESC
    """)
    
    nov_stats = cursor.fetchall()
    if nov_stats:
        print(f"{'姓名':<10} {'用户名':<10} {'次数':<8} {'总天数':<10} {'日期详情':<30}")
        print("-" * 80)
        for stat in nov_stats:
            print(f"{stat[0]:<10} {stat[1]:<10} {stat[2]:<8} {stat[3]:<10} {stat[4]:<30}")
    else:
        print("11月没有已批准的加班记录")
    
    # 5. 检查数据完整性
    print("\n5. 数据完整性检查：")
    print("-" * 80)
    cursor.execute("""
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN days IS NULL OR days = 0 THEN 1 ELSE 0 END) as missing_days,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
            SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_count
        FROM overtime_applications
    """)
    
    integrity = cursor.fetchone()
    print(f"总记录数: {integrity[0]}")
    print(f"天数字段缺失或为0的记录: {integrity[1]}")
    print(f"已批准: {integrity[2]}")
    print(f"待审批: {integrity[3]}")
    print(f"已拒绝: {integrity[4]}")
    
    conn.close()
    
    print("\n" + "=" * 80)
    print("诊断完成")
    print("=" * 80)

if __name__ == "__main__":
    try:
        check_overtime_data()
    except Exception as e:
        print(f"错误: {e}")
        import traceback
        traceback.print_exc()


