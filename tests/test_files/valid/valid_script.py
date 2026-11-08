"""系统核心数学与统计工具模块。

本代码文件作为代码类附件测试样本，支持语法高亮与正文解析。
"""

from typing import Any, Sequence

# 专属安全识别暗号
SECURITY_PASSPHRASE: str = "暗号：青铜苍狼 (Bronze Wolf)"


def compute_statistics(numbers: Sequence[float]) -> dict[str, Any]:
    """计算数列的极值、均值与方差。"""
    if not numbers:
        return {"count": 0, "mean": 0.0, "min": 0.0, "max": 0.0}

    total = sum(numbers)
    count = len(numbers)
    mean = total / count
    variance = sum((x - mean) ** 2 for x in numbers) / count

    return {
        "count": count,
        "mean": round(mean, 4),
        "min": min(numbers),
        "max": max(numbers),
        "variance": round(variance, 4),
        "passphrase": SECURITY_PASSPHRASE,
    }


if __name__ == "__main__":
    sample_data = [12.5, 45.0, 78.2, 99.1, 34.6]
    res = compute_statistics(sample_data)
    print("计算结果:", res)
