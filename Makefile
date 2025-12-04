.PHONY: help install install-dev test test-cov format lint type-check clean run migrate

# 默认目标
help:
	@echo "可用的命令:"
	@echo "  make install        - 安装生产依赖"
	@echo "  make install-dev    - 安装开发依赖"
	@echo "  make test           - 运行测试"
	@echo "  make test-cov       - 运行测试并生成覆盖率报告"
	@echo "  make format         - 格式化代码"
	@echo "  make lint           - 代码检查"
	@echo "  make type-check     - 类型检查"
	@echo "  make clean          - 清理临时文件"
	@echo "  make run            - 运行应用"
	@echo "  make migrate        - 执行数据库迁移"

# 安装生产依赖
install:
	pip install -r requirements.txt

# 安装开发依赖
install-dev:
	pip install -r requirements-dev.txt

# 运行测试
test:
	pytest

# 运行测试并生成覆盖率报告
test-cov:
	pytest --cov=backend --cov-report=html --cov-report=term

# 格式化代码
format:
	black backend tests
	isort backend tests

# 代码检查
lint:
	flake8 backend tests
	black --check backend tests
	isort --check-only backend tests

# 类型检查
type-check:
	mypy backend

# 清理临时文件
clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name "*.egg-info" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
	find . -type d -name ".mypy_cache" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete
	find . -type f -name ".coverage" -delete
	rm -rf htmlcov
	rm -rf dist
	rm -rf build

# 运行应用
run:
	python run.py

# 执行数据库迁移
migrate:
	python run_all_migrations.py

# 运行安全测试
test-security:
	python run_security_tests.py

# 代码质量检查（全部）
check: lint type-check test

# 开发环境设置
dev-setup: install-dev migrate
	@echo "开发环境设置完成！"
	@echo "运行 'make run' 启动应用"
