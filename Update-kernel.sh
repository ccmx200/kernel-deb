#!/bin/bash
set -e

# ========== 配置 ==========
BASE_URL="https://up-kernel.cuicanmx.cn"
FILES=(
    "linux-image-xiaomi-raphael.deb"
    "linux-headers-xiaomi-raphael.deb"
    "firmware-xiaomi-raphael.deb"
    "alsa-xiaomi-raphael.deb"
)
MAX_RETRIES=3
CONNECTIONS=4          # 每个文件的并行连接数（降低避免 429）
WORK_DIR="/tmp"
# ==========================

echo "=== 开始更新内核 ==="

# ---------- 权限与系统检查 ----------
if [ "$(id -u)" -ne 0 ]; then
    echo "必须使用 root 权限运行！"
    exit 1
fi

AVAILABLE=$(df -BM --output=avail "$WORK_DIR" | tail -1 | tr -d 'M')
if [ "$AVAILABLE" -lt 200 ]; then
    echo "错误：$WORK_DIR 可用空间不足 200 MB（当前 ${AVAILABLE} MB）"
    exit 1
fi

cd "$WORK_DIR" || exit 1

# ---------- 下载工具准备 ----------
echo "1. 检查下载工具..."
if ! command -v aria2c &> /dev/null; then
    echo "   安装 aria2（多线程下载）..."
    if ! apt-get install -y aria2 &> /dev/null; then
        apt-get update -qq && apt-get install -y -qq aria2 || {
            echo "   警告：aria2 安装失败，将使用 wget 单线程"
        }
    fi
fi

# ---------- 清理可能残留的临时文件 ----------
rm -f *.aria2 2>/dev/null || true

# ---------- 下载函数 ----------
download_with_aria2() {
    local file=$1
    local url="${BASE_URL}/${file}"
    local retry=0

    while [ $retry -lt $MAX_RETRIES ]; do
        echo "   [$(($retry+1))/$MAX_RETRIES] 下载 $file..."
        if aria2c -x $CONNECTIONS -s $CONNECTIONS -k 1M \
            --max-tries=2 --timeout=60 --retry-wait=5 \
            --console-log-level=error --summary-interval=0 \
            -o "$file" "$url" >/dev/null 2>&1; then
            echo "   ✓ $file 下载完成"
            return 0
        fi
        retry=$((retry+1))
        echo "   下载失败，等待重试..."
        rm -f "$file" "$file.aria2"
        sleep $((retry * 2))   # 递增等待
    done
    echo "   ✗ $file 下载失败（已重试 $MAX_RETRIES 次）"
    return 1
}

download_with_wget() {
    local file=$1
    local url="${BASE_URL}/${file}"
    local retry=0

    while [ $retry -lt $MAX_RETRIES ]; do
        echo "   [$(($retry+1))/$MAX_RETRIES] 下载 $file..."
        if wget --tries=3 --timeout=60 -q \
            -O "$file" "$url" 2>/dev/null; then
            echo "   ✓ $file 下载完成"
            return 0
        fi
        retry=$((retry+1))
        echo "   下载失败，等待重试..."
        rm -f "$file"
        sleep $((retry * 2))
    done
    echo "   ✗ $file 下载失败（已重试 $MAX_RETRIES 次）"
    return 1
}

# ---------- 批量并行下载 ----------
echo "2. 下载内核包 (${#FILES[@]} 个，多线程加速)"
failed_download=0
pids=()

for file in "${FILES[@]}"; do
    if command -v aria2c &> /dev/null; then
        download_with_aria2 "$file" &
    else
        download_with_wget "$file" &
    fi
    pids+=($!)
done

for pid in "${pids[@]}"; do
    if ! wait $pid; then
        failed_download=1
    fi
done

if [ $failed_download -eq 1 ]; then
    echo "错误：部分文件下载失败"
    rm -f "${FILES[@]}" *.aria2
    exit 1
fi
echo "   ✓ 所有文件下载完成"

# ---------- 验证文件 ----------
echo "3. 验证文件完整性"
for file in "${FILES[@]}"; do
    if [ ! -f "$file" ] || [ ! -s "$file" ]; then
        echo "   ✗ $file 缺失或为空"
        exit 1
    fi
done
echo "   ✓ 文件验证通过"

# ---------- 备份现有启动文件 ----------
echo "4. 备份当前启动文件"
if [ -f /boot/initramfs ]; then
    cp /boot/initramfs /boot/initramfs.bak.$(date +%s)
    echo "   已备份 /boot/initramfs"
fi
if [ -f /boot/linux.efi ]; then
    cp /boot/linux.efi /boot/linux.efi.bak.$(date +%s)
    echo "   已备份 /boot/linux.efi"
fi

# ---------- 卸载旧内核 ----------
echo "5. 卸载旧内核"
# 获取旧内核包名并 purge
OLD_PKGS=$(dpkg -l 2>/dev/null | grep -E "linux-(headers|image)-xiaomi|linux-xiaomi-raphael|firmware-xiaomi-raphael|alsa-xiaomi-raphael" | awk '{print $2}' | tr '\n' ' ')
if [ -n "$OLD_PKGS" ]; then
    echo "   发现旧包：$OLD_PKGS"
    dpkg --purge $OLD_PKGS 2>/dev/null || echo "   部分包可能已删除或无法移除"
else
    echo "   未发现旧内核包"
fi

# 安全删除模块（仅删除旧版，保留新装内核版本）
echo "   清理模块目录..."
if command -v linux-version &> /dev/null; then
    NEW_KERNEL_VER=$(linux-version list | head -1)   # 获取新内核版本（如果尚未安装则无输出）
fi
if [ -z "$NEW_KERNEL_VER" ]; then
    # 无法获取新版本时，保守保留所有 module 目录，不执行全局删除
    echo "   未检测到新内核版本，跳过模块清理"
else
    # 删除除新版本外的所有模块目录
    find /lib/modules -maxdepth 1 -mindepth 1 -type d ! -name "$NEW_KERNEL_VER" -exec rm -rf {} \; 2>/dev/null || true
    echo "   保留模块版本：$NEW_KERNEL_VER"
fi

# ---------- 安装新内核 ----------
echo "6. 安装新内核"
dpkg -i "${FILES[@]}" || {
    echo "   错误：内核安装失败，尝试恢复备份..."
    if [ -f /boot/initramfs.bak.* ]; then
        mv /boot/initramfs.bak.* /boot/initramfs
    fi
    if [ -f /boot/linux.efi.bak.* ]; then
        mv /boot/linux.efi.bak.* /boot/linux.efi
    fi
    exit 1
}

# ---------- 获取新安装的内核版本 ----------
echo "7. 检测新内核版本"
NEW_VER=$(ls -1 /lib/modules/ 2>/dev/null | tail -1)
if [ -z "$NEW_VER" ]; then
    echo "   错误：未找到新内核模块目录"
    exit 1
fi
echo "   内核版本：$NEW_VER"

# ---------- 生成 initramfs ----------
echo "8. 生成 initramfs"
if command -v update-initramfs &> /dev/null; then
    update-initramfs -c -k "$NEW_VER"
else
    echo "   未找到 update-initramfs 命令，跳过"
fi

# ---------- 配置启动文件 ----------
echo "9. 配置 /boot 启动文件"
rm -f /boot/initramfs /boot/linux.efi

INITRD="/boot/initrd.img-${NEW_VER}"
VMLINUZ="/boot/vmlinuz-${NEW_VER}"

if [ -f "$INITRD" ]; then
    mv "$INITRD" /boot/initramfs
    echo "   initramfs 来源：initrd.img-${NEW_VER}"
else
    echo "   警告：未找到 $INITRD，尝试使用最新 initrd"
    FALLBACK_INITRD=$(ls -t /boot/initrd.img-* 2>/dev/null | head -1)
    if [ -n "$FALLBACK_INITRD" ]; then
        mv "$FALLBACK_INITRD" /boot/initramfs
        echo "   使用 $FALLBACK_INITRD 作为 initramfs"
    else
        echo "   错误：无可用 initrd"
        exit 1
    fi
fi

if [ -f "$VMLINUZ" ]; then
    mv "$VMLINUZ" /boot/linux.efi
    echo "   linux.efi 来源：vmlinuz-${NEW_VER}"
else
    echo "   警告：未找到 $VMLINUZ，尝试使用最新 vmlinuz"
    FALLBACK_VMLINUZ=$(ls -t /boot/vmlinuz-* 2>/dev/null | head -1)
    if [ -n "$FALLBACK_VMLINUZ" ]; then
        mv "$FALLBACK_VMLINUZ" /boot/linux.efi
        echo "   使用 $FALLBACK_VMLINUZ 作为 linux.efi"
    else
        echo "   错误：无可用 vmlinuz"
        exit 1
    fi
fi

# ---------- 最终验证 ----------
echo "10. 验证启动文件"
if [ -f "/boot/initramfs" ] && [ -f "/boot/linux.efi" ]; then
    echo "   ✓ 启动文件就绪"
    ls -lh /boot/initramfs /boot/linux.efi | awk '{print "     " $9 " (" $5 ")"}'
else
    echo "   ✗ 启动文件缺失，更新失败"
    exit 1
fi

# ---------- 清理 ----------
echo "11. 清理临时文件"
rm -f "${FILES[@]}" *.aria2 /boot/initramfs.bak.* /boot/linux.efi.bak.* 2>/dev/null || true

echo "=== 更新完成！请执行 reboot 重启至新内核 ==="