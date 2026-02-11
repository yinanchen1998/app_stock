#!/usr/bin/env python3
"""
把分析结果（Tabs部分）移到股票输入框下方
"""

with open('src/App.tsx', 'r') as f:
    content = f.read()

# 找到分析结果部分（从 {analysisResult && 到 </Tabs>）
import re

# 提取分析结果部分
analysis_pattern = r'(\s+\{analysisResult && \(\s+<Tabs[^>]*>.*?\s+</Tabs>\s+\)\})'
analysis_match = re.search(analysis_pattern, content, re.DOTALL)

if not analysis_match:
    print("❌ 没有找到分析结果部分")
    exit(1)

analysis_block = analysis_match.group(1)
print(f"✅ 找到分析结果部分，长度: {len(analysis_block)}")

# 从原位置删除分析结果
content_without_analysis = content.replace(analysis_block, '\n        {/* 分析结果已移动到上方 */}')

# 找到股票输入框后面的位置（在实时行情图表之前插入）
insert_marker = '{/* 实时行情图表 - 输入股票后显示 */}'
if insert_marker not in content_without_analysis:
    # 尝试另一个位置
    insert_marker = '{/* K线图表 */}'
    
if insert_marker not in content_without_analysis:
    print("❌ 找不到插入位置")
    exit(1)

# 在标记之前插入分析结果
new_content = content_without_analysis.replace(
    insert_marker,
    analysis_block + '\n\n        ' + insert_marker
)

with open('src/App.tsx', 'w') as f:
    f.write(new_content)

print("✅ 分析结果已移动到股票输入框下方")
print("请检查并测试")
