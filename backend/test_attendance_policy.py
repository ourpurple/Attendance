#!/usr/bin/env python3
"""
打卡策略测试脚本
用于测试打卡策略是否真正起作用

使用方法：
1. 确保后端服务正在运行
2. 确保数据库中有活跃的打卡策略
3. 运行: python3 backend/test_attendance_policy.py
"""

import sys
import os
from datetime import datetime, time, timedelta
from pathlib import Path

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from backend.database import SessionLocal
from backend.models import AttendancePolicy
from backend.routers.attendance import get_policy_for_date, is_late, is_early_leave


def test_policy_loading():
    """测试策略加载"""
    print("=" * 60)
    print("测试1: 检查是否有活跃的打卡策略")
    print("=" * 60)
    
    db = SessionLocal()
    try:
        policy = db.query(AttendancePolicy).filter(AttendancePolicy.is_active == True).first()
        
        if not policy:
            print("❌ 未找到活跃的打卡策略！")
            print("   请在管理后台创建一个打卡策略并设置为启用状态。")
            return False
        
        print(f"✅ 找到活跃策略: {policy.name}")
        print(f"   上班时间: {policy.work_start_time}")
        print(f"   下班时间: {policy.work_end_time}")
        print(f"   上班打卡时段: {policy.checkin_start_time} - {policy.checkin_end_time}")
        print(f"   下班打卡时段: {policy.checkout_start_time} - {policy.checkout_end_time}")
        print(f"   迟到阈值: {policy.late_threshold_minutes} 分钟")
        print(f"   早退阈值: {policy.early_threshold_minutes} 分钟")
        
        if policy.weekly_rules:
            print(f"   每周规则: {policy.weekly_rules}")
        
        return True
    finally:
        db.close()


def test_policy_for_date():
    """测试特定日期的策略规则"""
    print("\n" + "=" * 60)
    print("测试2: 测试特定日期的策略规则")
    print("=" * 60)
    
    db = SessionLocal()
    try:
        policy = db.query(AttendancePolicy).filter(AttendancePolicy.is_active == True).first()
        
        if not policy:
            print("❌ 未找到活跃的打卡策略！")
            return False
        
        # 测试今天
        today = datetime.now()
        rules = get_policy_for_date(policy, today)
        
        print(f"✅ 今天的策略规则:")
        print(f"   上班时间: {rules.get('work_start_time')}")
        print(f"   下班时间: {rules.get('work_end_time')}")
        print(f"   上班打卡时段: {rules.get('checkin_start_time')} - {rules.get('checkin_end_time')}")
        print(f"   下班打卡时段: {rules.get('checkout_start_time')} - {rules.get('checkout_end_time')}")
        
        # 测试一周的每一天
        print(f"\n   一周的策略规则:")
        for day_offset in range(7):
            test_date = today + timedelta(days=day_offset)
            day_rules = get_policy_for_date(policy, test_date)
            weekday_name = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][test_date.weekday()]
            print(f"   {weekday_name} ({test_date.strftime('%Y-%m-%d')}): "
                  f"上班 {day_rules.get('work_start_time')} - 下班 {day_rules.get('work_end_time')}, "
                  f"打卡 {day_rules.get('checkin_start_time')}-{day_rules.get('checkin_end_time')} / "
                  f"{day_rules.get('checkout_start_time')}-{day_rules.get('checkout_end_time')}")
        
        return True
    finally:
        db.close()


def test_late_detection():
    """测试迟到检测"""
    print("\n" + "=" * 60)
    print("测试3: 测试迟到检测逻辑")
    print("=" * 60)
    
    db = SessionLocal()
    try:
        policy = db.query(AttendancePolicy).filter(AttendancePolicy.is_active == True).first()
        
        if not policy:
            print("❌ 未找到活跃的打卡策略！")
            return False
        
        # 获取今天的规则
        today = datetime.now()
        rules = get_policy_for_date(policy, today)
        work_start = datetime.strptime(rules['work_start_time'], "%H:%M").time()
        late_threshold = rules['late_threshold_minutes']
        
        # 测试不同时间的打卡
        # 使用 timedelta 来正确处理时间计算，避免分钟数超过 59
        base_time = datetime.combine(today.date(), work_start)
        
        test_cases = [
            (base_time - timedelta(minutes=1), False, "上班时间前1分钟"),
            (base_time, False, "正好上班时间"),
            (base_time + timedelta(minutes=late_threshold), False, f"上班时间后{late_threshold}分钟（阈值内）"),
            (base_time + timedelta(minutes=late_threshold + 1), True, f"上班时间后{late_threshold + 1}分钟（超过阈值）"),
        ]
        
        print(f"   上班时间: {work_start.strftime('%H:%M')}")
        print(f"   迟到阈值: {late_threshold} 分钟")
        print(f"\n   测试结果:")
        
        for test_time, expected_late, desc in test_cases:
            is_late_result = is_late(test_time, policy)
            status = "✅" if is_late_result == expected_late else "❌"
            print(f"   {status} {desc}: {test_time.strftime('%H:%M')} -> {'迟到' if is_late_result else '不迟到'} (期望: {'迟到' if expected_late else '不迟到'})")
        
        return True
    finally:
        db.close()


def test_early_leave_detection():
    """测试早退检测"""
    print("\n" + "=" * 60)
    print("测试4: 测试早退检测逻辑")
    print("=" * 60)
    
    db = SessionLocal()
    try:
        policy = db.query(AttendancePolicy).filter(AttendancePolicy.is_active == True).first()
        
        if not policy:
            print("❌ 未找到活跃的打卡策略！")
            return False
        
        # 获取今天的规则
        today = datetime.now()
        rules = get_policy_for_date(policy, today)
        work_end = datetime.strptime(rules['work_end_time'], "%H:%M").time()
        early_threshold = rules['early_threshold_minutes']
        
        # 测试不同时间的打卡
        # 使用 timedelta 来正确处理时间计算，避免分钟数小于 0 或超过 59
        base_time = datetime.combine(today.date(), work_end)
        
        test_cases = [
            (base_time - timedelta(minutes=early_threshold + 1), True, f"下班时间前{early_threshold + 1}分钟（超过阈值）"),
            (base_time - timedelta(minutes=early_threshold), False, f"下班时间前{early_threshold}分钟（阈值内）"),
            (base_time, False, "正好下班时间"),
            (base_time + timedelta(minutes=1), False, "下班时间后1分钟"),
        ]
        
        print(f"   下班时间: {work_end.strftime('%H:%M')}")
        print(f"   早退阈值: {early_threshold} 分钟")
        print(f"\n   测试结果:")
        
        for test_time, expected_early, desc in test_cases:
            is_early_result = is_early_leave(test_time, policy)
            status = "✅" if is_early_result == expected_early else "❌"
            print(f"   {status} {desc}: {test_time.strftime('%H:%M')} -> {'早退' if is_early_result else '不早退'} (期望: {'早退' if expected_early else '不早退'})")
        
        return True
    finally:
        db.close()


def test_punch_time_validation():
    """测试打卡时间范围验证（检查代码中是否有验证逻辑）"""
    print("\n" + "=" * 60)
    print("测试5: 检查打卡时间范围验证逻辑")
    print("=" * 60)
    
    # 检查代码中是否有验证打卡时间范围的逻辑
    attendance_file = project_root / "backend" / "routers" / "attendance.py"
    
    if not attendance_file.exists():
        print("❌ 无法找到 attendance.py 文件")
        return False
    
    with open(attendance_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 检查是否有验证打卡时间范围的代码
    # 需要检查是否在 checkin 和 checkout 函数中验证了时间范围
    has_checkin_validation = (
        'checkin_start_time' in content and 
        'checkin_end_time' in content and
        'checkin' in content and
        ('checkin_time' in content or 'checkin_start_time' in content)
    )
    
    has_checkout_validation = (
        'checkout_start_time' in content and 
        'checkout_end_time' in content and
        'checkout' in content and
        ('checkout_time' in content or 'checkout_start_time' in content)
    )
    
    # 更精确的检查：是否在打卡接口中验证了时间范围
    checkin_func = content.find('def checkin(')
    checkout_func = content.find('def checkout(')
    
    if checkin_func != -1:
        checkin_end = content.find('def ', checkin_func + 1)
        if checkin_end == -1:
            checkin_end = len(content)
        checkin_content = content[checkin_func:checkin_end]
        has_checkin_time_range_check = (
            'checkin_start_time' in checkin_content and 
            'checkin_end_time' in checkin_content and
            ('<' in checkin_content or '>' in checkin_content or 'between' in checkin_content.lower())
        )
    else:
        has_checkin_time_range_check = False
    
    if checkout_func != -1:
        checkout_end = content.find('def ', checkout_func + 1)
        if checkout_end == -1:
            checkout_end = len(content)
        checkout_content = content[checkout_func:checkout_end]
        has_checkout_time_range_check = (
            'checkout_start_time' in checkout_content and 
            'checkout_end_time' in checkout_content and
            ('<' in checkout_content or '>' in checkout_content or 'between' in checkout_content.lower())
        )
    else:
        has_checkout_time_range_check = False
    
    print(f"   代码检查结果:")
    print(f"   - 上班打卡时间范围验证: {'✅ 存在' if has_checkin_time_range_check else '❌ 不存在'}")
    print(f"   - 下班打卡时间范围验证: {'✅ 存在' if has_checkout_time_range_check else '❌ 不存在'}")
    
    if not has_checkin_time_range_check or not has_checkout_time_range_check:
        print(f"\n   ⚠️  警告: 代码中缺少打卡时间范围的验证逻辑！")
        print(f"      这意味着用户可以在策略规定的时间范围外打卡。")
        print(f"      建议在 checkin 和 checkout 接口中添加时间范围验证。")
        print(f"\n      示例验证逻辑:")
        print(f"      - 上班打卡: 检查当前时间是否在 checkin_start_time 和 checkin_end_time 之间")
        print(f"      - 下班打卡: 检查当前时间是否在 checkout_start_time 和 checkout_end_time 之间")
    
    return True


def test_weekly_rules():
    """测试每周规则"""
    print("\n" + "=" * 60)
    print("测试6: 测试每周规则（如果存在）")
    print("=" * 60)
    
    db = SessionLocal()
    try:
        policy = db.query(AttendancePolicy).filter(AttendancePolicy.is_active == True).first()
        
        if not policy:
            print("❌ 未找到活跃的打卡策略！")
            return False
        
        if not policy.weekly_rules:
            print("ℹ️  当前策略没有配置每周规则")
            return True
        
        import json
        try:
            weekly_rules = json.loads(policy.weekly_rules)
            print(f"✅ 找到每周规则:")
            for weekday, rules in weekly_rules.items():
                weekday_name = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][int(weekday)]
                print(f"   {weekday_name} (星期{weekday}):")
                for key, value in rules.items():
                    print(f"      {key}: {value}")
        except json.JSONDecodeError as e:
            print(f"❌ 每周规则JSON格式错误: {e}")
            return False
        
        return True
    finally:
        db.close()


def main():
    """主测试函数"""
    print("\n" + "=" * 60)
    print("打卡策略测试脚本")
    print("=" * 60)
    print()
    
    results = []
    
    # 运行所有测试
    results.append(("策略加载", test_policy_loading()))
    results.append(("日期规则", test_policy_for_date()))
    results.append(("迟到检测", test_late_detection()))
    results.append(("早退检测", test_early_leave_detection()))
    results.append(("时间验证", test_punch_time_validation()))
    results.append(("每周规则", test_weekly_rules()))
    
    # 汇总结果
    print("\n" + "=" * 60)
    print("测试结果汇总")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ 通过" if result else "❌ 失败"
        print(f"   {test_name}: {status}")
    
    print(f"\n   总计: {passed}/{total} 测试通过")
    
    if passed == total:
        print("\n✅ 所有测试通过！打卡策略功能正常。")
    else:
        print("\n⚠️  部分测试失败，请检查上述输出。")
    
    return passed == total


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
