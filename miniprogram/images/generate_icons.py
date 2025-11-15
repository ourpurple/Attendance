#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将 Emoji 转换为微信小程序 tabBar 图标
需要安装: pip install pillow
"""

from PIL import Image, ImageDraw, ImageFont
import os

# 图标配置
ICONS = {
    'home': {
        'emoji': '🏠',
        'text': '首页'
    },
    'attendance': {
        'emoji': '📝',
        'text': '考勤'
    },
    'approval': {
        'emoji': '✅',
        'text': '审批'
    },
    'mine': {
        'emoji': '👤',
        'text': '我的'
    }
}

# 颜色配置
COLOR_NORMAL = '#8E8E93'  # 未选中颜色
COLOR_SELECTED = '#007AFF'  # 选中颜色

# 图标尺寸
SIZE = 81  # 微信小程序推荐 81x81


def create_icon(name, emoji, color, output_path):
    """创建图标"""
    # 创建透明背景
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 尝试使用系统字体显示 Emoji
    # 注意：Emoji 渲染在不同系统上可能不同
    try:
        # macOS
        font = ImageFont.truetype('/System/Library/Fonts/Apple Color Emoji.ttc', 60)
    except:
        try:
            # Windows
            font = ImageFont.truetype('C:/Windows/Fonts/seguiemj.ttf', 60)
        except:
            # Linux 或其他
            font = ImageFont.load_default()
    
    # 计算文本位置（居中）
    bbox = draw.textbbox((0, 0), emoji, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (SIZE - text_width) // 2 - bbox[0]
    y = (SIZE - text_height) // 2 - bbox[1]
    
    # 绘制文本（Emoji）
    draw.text((x, y), emoji, font=font, fill=color)
    
    # 保存图片
    img.save(output_path, 'PNG')
    print(f'✅ 已创建: {output_path}')


def main():
    """主函数"""
    # 确保输出目录存在
    output_dir = os.path.dirname(os.path.abspath(__file__))
    
    print('开始生成图标...')
    print(f'输出目录: {output_dir}\n')
    
    # 生成未选中图标
    print('生成未选中图标（灰色）...')
    for name, config in ICONS.items():
        output_path = os.path.join(output_dir, f'{name}.png')
        create_icon(name, config['emoji'], COLOR_NORMAL, output_path)
    
    # 生成选中图标
    print('\n生成选中图标（蓝色）...')
    for name, config in ICONS.items():
        output_path = os.path.join(output_dir, f'{name}-active.png')
        create_icon(name, config['emoji'], COLOR_SELECTED, output_path)
    
    print('\n✅ 所有图标生成完成！')
    print('\n注意：如果 Emoji 显示不正确，请使用在线工具手动转换：')
    print('1. 访问 https://www.iconfont.cn/ 或 https://www.iconfinder.com/')
    print('2. 搜索对应的图标')
    print('3. 下载 PNG 格式，尺寸 81x81px')
    print('4. 替换 images 目录下的文件')


if __name__ == '__main__':
    main()

