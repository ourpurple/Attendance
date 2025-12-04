#!/usr/bin/env python
"""
运行安全功能测试脚本
"""
import subprocess
import sys

def run_tests():
    """运行测试"""
    print("=" * 60)
    print("运行安全功能测试")
    print("=" * 60)
    print()
    
    test_files = [
        "tests/test_security.py",
        "tests/test_timezone.py",
        "tests/test_optimistic_lock.py"
    ]
    
    for test_file in test_files:
        print(f"\n{'=' * 60}")
        print(f"测试文件: {test_file}")
        print('=' * 60)
        
        result = subprocess.run(
            [sys.executable, "-m", "pytest", test_file, "-v", "--tb=short"],
            capture_output=False
        )
        
        if result.returncode != 0:
            print(f"\n[FAILED] {test_file} 测试失败")
            return False
        else:
            print(f"\n[PASSED] {test_file} 测试通过")
    
    print("\n" + "=" * 60)
    print("[SUCCESS] 所有测试通过！")
    print("=" * 60)
    return True

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
