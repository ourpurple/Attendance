#!/usr/bin/env python3
"""
数据库初始化脚本
创建初始管理员用户和示例数据
"""
import json
import sqlite3
import os
from backend.database import SessionLocal, init_db
from backend.models import User, Department, AttendancePolicy, UserRole, Holiday, VicePresidentDepartment, LeaveType
from backend.security import get_password_hash
from datetime import datetime


def ensure_wechat_openid_field():
    """确保 users 表有 wechat_openid 字段"""
    db_path = "attendance.db"
    
    if not os.path.exists(db_path):
        # 数据库不存在，会在 init_db() 中自动创建
        return
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 检查表是否存在
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        if not cursor.fetchone():
            conn.close()
            return
        
        # 检查字段是否存在
        cursor.execute("PRAGMA table_info(users)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if "wechat_openid" not in columns:
            print("检测到 users 表缺少 wechat_openid 字段，正在添加...")
            try:
                # 添加字段
                cursor.execute("ALTER TABLE users ADD COLUMN wechat_openid VARCHAR(128)")
                # 创建唯一索引
                cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wechat_openid ON users(wechat_openid)")
                conn.commit()
                print("✓ 成功添加 wechat_openid 字段和索引")
            except Exception as e:
                print(f"⚠️ 添加字段失败（可能已存在）: {str(e)}")
                conn.rollback()
        else:
            # 确保索引存在（即使字段已存在，索引可能不存在）
            try:
                cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wechat_openid ON users(wechat_openid)")
                conn.commit()
            except Exception as e:
                # 索引可能已存在，忽略错误
                pass
        
        conn.close()
    except Exception as e:
        print(f"⚠️ 检查/添加 wechat_openid 字段时出错: {str(e)}")
        # 不影响主流程，继续执行


def ensure_annual_leave_days_field():
    """确保 users 表有 annual_leave_days 字段"""
    db_path = "attendance.db"
    
    if not os.path.exists(db_path):
        # 数据库不存在，会在 init_db() 中自动创建
        return
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 检查表是否存在
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        if not cursor.fetchone():
            conn.close()
            return
        
        # 检查字段是否存在
        cursor.execute("PRAGMA table_info(users)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if "annual_leave_days" not in columns:
            print("检测到 users 表缺少 annual_leave_days 字段，正在添加...")
            try:
                # 添加字段
                cursor.execute("ALTER TABLE users ADD COLUMN annual_leave_days FLOAT DEFAULT 10.0")
                # 为所有现有用户设置默认年假天数为10天
                cursor.execute("UPDATE users SET annual_leave_days = 10.0 WHERE annual_leave_days IS NULL")
                conn.commit()
                print("✓ 成功添加 annual_leave_days 字段并设置默认值")
            except Exception as e:
                print(f"⚠️ 添加字段失败（可能已存在）: {str(e)}")
                conn.rollback()
        
        conn.close()
    except Exception as e:
        print(f"⚠️ 检查/添加 annual_leave_days 字段时出错: {str(e)}")
        # 不影响主流程，继续执行


def create_initial_data():
    """创建初始数据"""
    db = SessionLocal()
    
    try:
        # 检查是否已经初始化
        if db.query(User).first():
            print("数据库已经初始化，跳过...")
            return
        
        print("开始初始化数据库...")
        
        # 创建部门
        departments = [
            Department(name="市场营销部", description="市场营销部门"),
            Department(name="编辑出版部", description="编辑出版部门"),
            Department(name="财务部", description="财务管理部门"),
            Department(name="储运部", description="仓储物流部门"),
            Department(name="办公室", description="行政办公部门"),
        ]
        
        for dept in departments:
            db.add(dept)
        
        db.commit()
        print("✓ 创建了5个部门")
        
        # 创建默认请假类型
        leave_types = [
            LeaveType(name="普通请假", description="常规病假/事假"),
            LeaveType(name="加班调休", description="加班折算的调休假"),
            LeaveType(name="年假调休", description="年假或年假调休")
        ]
        for lt in leave_types:
            db.add(lt)
        db.commit()
        print("✓ 创建了默认请假类型")
        
        # 创建用户（统一密码：123456）
        users = [
            # 系统管理员
            User(
                username="admin",
                password_hash=get_password_hash("admin123"),
                real_name="系统管理员",
                email="admin@example.com",
                role=UserRole.ADMIN,
                is_active=True,
                annual_leave_days=10.0
            ),
            # 总经理
            User(
                username="徐静",
                password_hash=get_password_hash("123456"),
                real_name="徐静",
                email="xujing@example.com",
                role=UserRole.GENERAL_MANAGER,
                is_active=True
            ),
            
            # ===== 副总（3人）=====
            User(
                username="郜会芹",
                password_hash=get_password_hash("123456"),
                real_name="郜会芹",
                email="gaohuiqin@example.com",
                role=UserRole.VICE_PRESIDENT,
                is_active=True
            ),
            User(
                username="李娅",
                password_hash=get_password_hash("123456"),
                real_name="李娅",
                email="liya@example.com",
                role=UserRole.VICE_PRESIDENT,
                is_active=True
            ),
            User(
                username="王莎",
                password_hash=get_password_hash("123456"),
                real_name="王莎",
                email="wangsha@example.com",
                role=UserRole.VICE_PRESIDENT,
                is_active=True
            ),
            
            # ===== 各部门主任 =====
            # 市场营销部主任
            User(
                username="赵强",
                password_hash=get_password_hash("123456"),
                real_name="赵强",
                email="zhaoqiang@example.com",
                role=UserRole.DEPARTMENT_HEAD,
                department_id=1,  # 市场营销部
                is_active=True
            ),
            # 编辑出版部主任
            User(
                username="牛鋆辉",
                password_hash=get_password_hash("123456"),
                real_name="牛鋆辉",
                email="niujunhui@example.com",
                role=UserRole.DEPARTMENT_HEAD,
                department_id=2,  # 编辑出版部
                is_active=True
            ),
            # 财务部主任
            User(
                username="李平",
                password_hash=get_password_hash("123456"),
                real_name="李平",
                email="liping@example.com",
                role=UserRole.DEPARTMENT_HEAD,
                department_id=3,  # 财务部
                is_active=True
            ),
            # 储运部主任
            User(
                username="徐卓",
                password_hash=get_password_hash("123456"),
                real_name="徐卓",
                email="xuzhuo@example.com",
                role=UserRole.DEPARTMENT_HEAD,
                department_id=4,  # 储运部
                is_active=True
            ),
            # 办公室主任
            User(
                username="徐晓",
                password_hash=get_password_hash("123456"),
                real_name="徐晓",
                email="xuxiao@example.com",
                role=UserRole.DEPARTMENT_HEAD,
                department_id=5,  # 办公室
                is_active=True
            ),
            
            # ===== 编辑出版部员工（4人）=====
            User(
                username="徐子俊",
                password_hash=get_password_hash("123456"),
                real_name="徐子俊",
                email="xuzijun@example.com",
                role=UserRole.EMPLOYEE,
                department_id=2,  # 编辑出版部
                is_active=True
            ),
            User(
                username="杨娟",
                password_hash=get_password_hash("123456"),
                real_name="杨娟",
                email="yangjuan@example.com",
                role=UserRole.EMPLOYEE,
                department_id=2,  # 编辑出版部
                is_active=True
            ),
            User(
                username="王霄",
                password_hash=get_password_hash("123456"),
                real_name="王霄",
                email="wangxiao@example.com",
                role=UserRole.EMPLOYEE,
                department_id=2,  # 编辑出版部
                is_active=True
            ),
            User(
                username="王文文",
                password_hash=get_password_hash("123456"),
                real_name="王文文",
                email="wangwenwen@example.com",
                role=UserRole.EMPLOYEE,
                department_id=2,  # 编辑出版部
                is_active=True
            ),
            
            # ===== 市场营销部员工（8人）=====
            User(
                username="徐璇",
                password_hash=get_password_hash("123456"),
                real_name="徐璇",
                email="xuxuan@example.com",
                role=UserRole.EMPLOYEE,
                department_id=1,  # 市场营销部
                is_active=True
            ),
            User(
                username="徐力",
                password_hash=get_password_hash("123456"),
                real_name="徐力",
                email="xuli@example.com",
                role=UserRole.EMPLOYEE,
                department_id=1,  # 市场营销部
                is_active=True
            ),
            User(
                username="刘源",
                password_hash=get_password_hash("123456"),
                real_name="刘源",
                email="liuyuan@example.com",
                role=UserRole.EMPLOYEE,
                department_id=1,  # 市场营销部
                is_active=True
            ),
            User(
                username="王浩杰",
                password_hash=get_password_hash("123456"),
                real_name="王浩杰",
                email="wanghaojie@example.com",
                role=UserRole.EMPLOYEE,
                department_id=1,  # 市场营销部
                is_active=True
            ),
            User(
                username="张鹏飞",
                password_hash=get_password_hash("123456"),
                real_name="张鹏飞",
                email="zhangpengfei@example.com",
                role=UserRole.EMPLOYEE,
                department_id=1,  # 市场营销部
                is_active=True
            ),
            User(
                username="郭泽良",
                password_hash=get_password_hash("123456"),
                real_name="郭泽良",
                email="guozeliang@example.com",
                role=UserRole.EMPLOYEE,
                department_id=1,  # 市场营销部
                is_active=True
            ),
            User(
                username="郑亮",
                password_hash=get_password_hash("123456"),
                real_name="郑亮",
                email="zhengliang@example.com",
                role=UserRole.EMPLOYEE,
                department_id=1,  # 市场营销部
                is_active=True
            ),
            User(
                username="黄文露",
                password_hash=get_password_hash("123456"),
                real_name="黄文露",
                email="huangwenlu@example.com",
                role=UserRole.EMPLOYEE,
                department_id=1,  # 市场营销部
                is_active=True
            ),
            
            # ===== 办公室员工（2人）=====
            User(
                username="胡广娜",
                password_hash=get_password_hash("123456"),
                real_name="胡广娜",
                email="huna@example.com",
                role=UserRole.EMPLOYEE,
                department_id=5,  # 办公室
                is_active=True
            ),
            User(
                username="边岳萌",
                password_hash=get_password_hash("123456"),
                real_name="边岳萌",
                email="bianyuemeng@example.com",
                role=UserRole.EMPLOYEE,
                department_id=5,  # 办公室
                is_active=True
            ),
            
            # ===== 财务部员工（3人）=====
            User(
                username="刘玉莲",
                password_hash=get_password_hash("123456"),
                real_name="刘玉莲",
                email="liuyulian@example.com",
                role=UserRole.EMPLOYEE,
                department_id=3,  # 财务部
                is_active=True
            ),
            User(
                username="李柳琪",
                password_hash=get_password_hash("123456"),
                real_name="李柳琪",
                email="liliuqi@example.com",
                role=UserRole.EMPLOYEE,
                department_id=3,  # 财务部
                is_active=True
            ),
            User(
                username="王付巍",
                password_hash=get_password_hash("123456"),
                real_name="王付巍",
                email="wangfuwei@example.com",
                role=UserRole.EMPLOYEE,
                department_id=3,  # 财务部
                is_active=True
            ),
            
            # ===== 储运部员工（2人）=====
            User(
                username="牛红艳",
                password_hash=get_password_hash("123456"),
                real_name="牛红艳",
                email="niuhongyan@example.com",
                role=UserRole.EMPLOYEE,
                department_id=4,  # 储运部
                is_active=True
            ),
            User(
                username="徐永红",
                password_hash=get_password_hash("123456"),
                real_name="徐永红",
                email="xuyonghong@example.com",
                role=UserRole.EMPLOYEE,
                department_id=4,  # 储运部
                is_active=True
            ),
        ]
        
        for user in users:
            db.add(user)
        
        db.commit()
        print("✓ 创建了29个用户")
        print("  - 1个管理员")
        print("  - 1个总经理")
        print("  - 3个副总")
        print("  - 5个部门主任")
        print("  - 19个员工（编辑出版部4人、市场营销部8人、办公室2人、财务部3人、储运部2人）")
        
        # 更新各部门主任
        dept_head_mapping = [
            ("市场营销部", "赵强"),
            ("编辑出版部", "牛鋆辉"),
            ("财务部", "李平"),
            ("储运部", "徐卓"),
            ("办公室", "徐晓"),
        ]
        
        for dept_name, head_name in dept_head_mapping:
            dept = db.query(Department).filter(Department.name == dept_name).first()
            head = db.query(User).filter(User.username == head_name).first()
            if dept and head:
                dept.head_id = head.id
        
        db.commit()
        print("✓ 设置了5个部门的主任")
        
        # 创建默认打卡策略（带每周规则）
        # 周一至周四：17:30下班，周五：12:00下班
        weekly_rules = {
            "4": {  # 周五（0=周一, 4=周五）
                "work_end_time": "12:00",
                "checkout_start_time": "11:30",
                "checkout_end_time": "23:59"
            }
        }
        
        policy = AttendancePolicy(
            name="标准工作制（周五半天）",
            work_start_time="09:00",
            work_end_time="17:30",  # 默认下班时间（周一至周四）
            checkin_start_time="08:00",
            checkin_end_time="09:30",
            checkout_start_time="17:00",  # 默认下班打卡开始
            checkout_end_time="23:59",
            late_threshold_minutes=0,
            early_threshold_minutes=0,
            weekly_rules=json.dumps(weekly_rules),  # 每周特殊规则
            is_active=True
        )
        db.add(policy)
        db.commit()
        print("✓ 创建了默认打卡策略（包含每周规则）")
        
        # 创建2025年法定节假日
        print("\n正在添加2025年法定节假日...")
        holidays_2025 = [
            # 元旦（2024-12-30至2025-1-1，共3天）
            Holiday(date="2025-01-01", name="元旦", type="holiday", description="元旦假期"),
            
            # 春节（2025-1-28至2-4，共8天）
            Holiday(date="2025-01-28", name="春节", type="holiday", description="春节假期（除夕）"),
            Holiday(date="2025-01-29", name="春节", type="holiday", description="春节假期（初一）"),
            Holiday(date="2025-01-30", name="春节", type="holiday", description="春节假期（初二）"),
            Holiday(date="2025-01-31", name="春节", type="holiday", description="春节假期（初三）"),
            Holiday(date="2025-02-01", name="春节", type="holiday", description="春节假期（初四）"),
            Holiday(date="2025-02-02", name="春节", type="holiday", description="春节假期（初五）"),
            Holiday(date="2025-02-03", name="春节", type="holiday", description="春节假期（初六）"),
            Holiday(date="2025-02-04", name="春节", type="holiday", description="春节假期（初七）"),
            
            # 春节调休（1月26日周日、2月8日周六上班）
            Holiday(date="2025-01-26", name="春节调休", type="workday", description="春节调休（周日上班）"),
            Holiday(date="2025-02-08", name="春节调休", type="workday", description="春节调休（周六上班）"),
            
            # 清明节（4-4至4-6，共3天）
            Holiday(date="2025-04-04", name="清明节", type="holiday", description="清明节假期"),
            Holiday(date="2025-04-05", name="清明节", type="holiday", description="清明节假期"),
            Holiday(date="2025-04-06", name="清明节", type="holiday", description="清明节假期"),
            
            # 劳动节（5-1至5-5，共5天）
            Holiday(date="2025-05-01", name="劳动节", type="holiday", description="劳动节假期"),
            Holiday(date="2025-05-02", name="劳动节", type="holiday", description="劳动节假期"),
            Holiday(date="2025-05-03", name="劳动节", type="holiday", description="劳动节假期"),
            Holiday(date="2025-05-04", name="劳动节", type="holiday", description="劳动节假期"),
            Holiday(date="2025-05-05", name="劳动节", type="holiday", description="劳动节假期"),
            
            # 劳动节调休（4月27日周日上班）
            Holiday(date="2025-04-27", name="劳动节调休", type="workday", description="劳动节调休（周日上班）"),
            
            # 端午节（5-31至6-2，共3天）
            Holiday(date="2025-05-31", name="端午节", type="holiday", description="端午节假期"),
            Holiday(date="2025-06-02", name="端午节", type="holiday", description="端午节假期"),
            
            # 中秋节（10-6至10-8，共3天）
            Holiday(date="2025-10-06", name="中秋节", type="holiday", description="中秋节假期"),
            Holiday(date="2025-10-07", name="中秋节", type="holiday", description="中秋节假期"),
            Holiday(date="2025-10-08", name="中秋节", type="holiday", description="中秋节假期"),
            
            # 中秋节调休（9月28日周日、10月11日周六上班）
            Holiday(date="2025-09-28", name="中秋节调休", type="workday", description="中秋节调休（周日上班）"),
            Holiday(date="2025-10-11", name="中秋节调休", type="workday", description="中秋节调休（周六上班）"),
            
            # 国庆节（10-1至10-5，共5天，与中秋节连休，实际10-1至10-8）
            Holiday(date="2025-10-01", name="国庆节", type="holiday", description="国庆节假期"),
            Holiday(date="2025-10-02", name="国庆节", type="holiday", description="国庆节假期"),
            Holiday(date="2025-10-03", name="国庆节", type="holiday", description="国庆节假期"),
            Holiday(date="2025-10-04", name="国庆节", type="holiday", description="国庆节假期"),
            Holiday(date="2025-10-05", name="国庆节", type="holiday", description="国庆节假期"),
        ]
        
        db.add_all(holidays_2025)
        db.commit()
        print(f"✓ 已添加 {len(holidays_2025)} 条节假日配置")
        
        # 创建副总与部门的分管关系
        print("\n正在创建副总与部门的分管关系...")
        
        # 获取副总和部门
        liya = db.query(User).filter(User.username == "李娅").first()
        wangsha = db.query(User).filter(User.username == "王莎").first()
        gaohuiqin = db.query(User).filter(User.username == "郜会芹").first()
        
        editing_dept = db.query(Department).filter(Department.name == "编辑出版部").first()
        office_dept = db.query(Department).filter(Department.name == "办公室").first()
        marketing_dept = db.query(Department).filter(Department.name == "市场营销部").first()
        finance_dept = db.query(Department).filter(Department.name == "财务部").first()
        storage_dept = db.query(Department).filter(Department.name == "储运部").first()
        
        # 李娅负责编辑出版部、办公室
        if liya and editing_dept:
            vp_dept = VicePresidentDepartment(vice_president_id=liya.id, department_id=editing_dept.id)
            db.add(vp_dept)
        if liya and office_dept:
            vp_dept = VicePresidentDepartment(vice_president_id=liya.id, department_id=office_dept.id)
            db.add(vp_dept)
        
        # 王莎负责市场营销部
        if wangsha and marketing_dept:
            vp_dept = VicePresidentDepartment(vice_president_id=wangsha.id, department_id=marketing_dept.id)
            db.add(vp_dept)
        
        # 郜会芹负责财务部、储运部
        if gaohuiqin and finance_dept:
            vp_dept = VicePresidentDepartment(vice_president_id=gaohuiqin.id, department_id=finance_dept.id)
            db.add(vp_dept)
        if gaohuiqin and storage_dept:
            vp_dept = VicePresidentDepartment(vice_president_id=gaohuiqin.id, department_id=storage_dept.id)
            db.add(vp_dept)
        
        db.commit()
        print("✓ 创建了副总与部门的分管关系")
        print("  - 李娅：编辑出版部、办公室")
        print("  - 王莎：市场营销部")
        print("  - 郜会芹：财务部、储运部")
        
        print("\n" + "=" * 60)
        print("初始化完成！")
        print("=" * 60)
        print("\n账号信息汇总：")
        print("\n【系统管理员】")
        print("  用户名: admin")
        print("  密码: admin123")
        print("  说明: 用于系统管理和配置")
        
        print("\n【总经理】")
        print("  用户名: 徐静")
        print("  密码: 123456")
        
        print("\n【副总（3人）】")
        print("  用户名: 郜会芹  密码: 123456")
        print("  用户名: 李娅    密码: 123456")
        print("  用户名: 王莎    密码: 123456")
        
        print("\n【部门主任（5人）】")
        print("  营销部主任 - 用户名: 赵强      密码: 123456")
        print("  编辑出版部主任 - 用户名: 牛鋆辉  密码: 123456")
        print("  财务部主任 - 用户名: 李平      密码: 123456")
        print("  仓储部主任 - 用户名: 徐卓      密码: 123456")
        print("  办公室主任 - 用户名: 徐晓      密码: 123456")
        
        print("\n【编辑出版部员工（4人）】")
        print("  用户名: 徐子俊  密码: 123456")
        print("  用户名: 杨娟    密码: 123456")
        print("  用户名: 王霄    密码: 123456")
        print("  用户名: 王文文  密码: 123456")
        
        print("\n【市场营销部员工（8人）】")
        print("  用户名: 徐璇    密码: 123456")
        print("  用户名: 徐力    密码: 123456")
        print("  用户名: 刘源    密码: 123456")
        print("  用户名: 王浩杰  密码: 123456")
        print("  用户名: 张鹏飞  密码: 123456")
        print("  用户名: 郭泽良  密码: 123456")
        print("  用户名: 郑亮    密码: 123456")
        print("  用户名: 黄文露  密码: 123456")
        
        print("\n【办公室员工（2人）】")
        print("  用户名: 胡广娜    密码: 123456")
        print("  用户名: 边岳萌  密码: 123456")
        
        print("\n【财务部员工（3人）】")
        print("  用户名: 刘玉莲  密码: 123456")
        print("  用户名: 李柳琪  密码: 123456")
        print("  用户名: 王付巍  密码: 123456")
        
        print("\n【储运部员工（2人）】")
        print("  用户名: 牛红艳  密码: 123456")
        print("  用户名: 徐永红  密码: 123456")
        
        print("\n【副总分管关系】")
        print("  李娅：编辑出版部、办公室")
        print("  王莎：市场营销部")
        print("  郜会芹：财务部、储运部")
        
        print("\n" + "=" * 60)
        print("提示：")
        print("  - 所有员工密码统一为：123456（管理员除外）")
        print("  - 用户名即为真实姓名")
        print("  - 管理后台：http://localhost:8000/admin/")
        print("  - 移动端：http://localhost:8000/mobile/")
        print("  - 已配置2025年法定节假日和调休日")
        print("=" * 60)
        
    except Exception as e:
        print(f"初始化失败: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    # 初始化数据库结构
    init_db()
    print("✓ 数据库表结构创建完成")
    
    # 确保 wechat_openid 字段存在（用于已存在的数据库）
    ensure_wechat_openid_field()
    
    # 确保 annual_leave_days 字段存在（用于已存在的数据库）
    ensure_annual_leave_days_field()
    
    # 创建初始数据
    create_initial_data()


