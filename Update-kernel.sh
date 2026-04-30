#!/bin/bash
set -e

BASE_URL="https://up-kernel.cuicanmx.cn"
FILES=(
    "linux-image-xiaomi-raphael.deb"
    "linux-headers-xiaomi-raphael.deb"
    "firmware-xiaomi-raphael.deb"
    "alsa-xiaomi-raphael.deb"
)
MAX_RETRIES=3
CONNECTIONS=16

echo "=== 开始更新内核 ==="

cd /tmp || exit 1

# 检查并使用 aria2 下载（支持多线程）
echo "1. 检查下载工具..."
if ! command -v aria2c &> /dev/null; then
    echo "   安装 aria2 以启用多线程下载..."
    apt-get update -qq && apt-get install -y -qq aria2 || {
        echo "   警告：aria2 安装失败，将使用 wget 单线程下载"
    }
fi

echo "2. 下载内核包 (${#FILES[@]}个，多线程加速)"

# 使用 aria2 并行下载
download_with_aria2() {
    local file=$1
    local url="${BASE_URL}/${file}"
    local retry=0
    
    while [ $retry -lt $MAX_RETRIES ]; do
        echo "   [$(($retry+1))/$MAX_RETRIES] 下载 $file..."
        
        if aria2c -x $CONNECTIONS -s $CONNECTIONS -k 1M \
            --max-tries=3 --timeout=60 \
            --console-log-level=warn --summary-interval=0 \
            -o "$file" "$url" 2>/dev/null; then
            echo "   ✓ $file 下载完成"
            return 0
        fi
        
        retry=$((retry+1))
        echo "   下载失败，重试..."
        rm -f "$file" "$file.aria2"
        sleep 2
    done
    
    echo "   ✗ $file 下载失败（已重试 $MAX_RETRIES 次）"
    return 1
}

# 使用 wget 单线程下载（备用）
download_with_wget() {
    local file=$1
    local url="${BASE_URL}/${file}"
    local retry=0
    
    while [ $retry -lt $MAX_RETRIES ]; do
        echo "   [$(($retry+1))/$MAX_RETRIES] 下载 $file..."
        
        if wget --tries=3 --timeout=60 -q --show-progress \
            -O "$file" "$url" 2>/dev/null; then
            echo "   ✓ $file 下载完成"
            return 0
        fi
        
        retry=$((retry+1))
        echo "   下载失败，重试..."
        rm -f "$file"
        sleep 2
    done
    
    echo "   ✗ $file 下载失败（已重试 $MAX_RETRIES 次）"
    return 1
}

# 并行下载所有文件
download_all() {
    local pids=()
    local failed=0
    
    for file in "${FILES[@]}"; do
        if command -v aria2c &> /dev/null; then
            download_with_aria2 "$file" &
        else
            download_with_wget "$file" &
        fi
        pids+=($!)
    done
    
    # 等待所有下载完成
    for pid in "${pids[@]}"; do
        if ! wait $pid; then
            failed=1
        fi
    done
    
    return $failed
}

if ! download_all; then
    echo "错误：部分文件下载失败"
    rm -f "${FILES[@]}" *.aria2
    exit 1
fi

echo "   ✓ 所有文件下载完成"

echo "3. 验证文件完整性"
for file in "${FILES[@]}"; do
    if [ ! -f "$file" ] || [ ! -s "$file" ]; then
        echo "   ✗ $file 文件缺失或为空"
        exit 1
    fi
done
echo "   ✓ 文件验证通过"

echo "4. 卸载旧内核"
dpkg -l 2>/dev/null | grep -E "linux-(headers|image)-xiaomi|linux-xiaomi-raphael" | awk '{print $2}' | xargs -r dpkg -P 2>/dev/null || true
rm -rf /lib/modules/*

echo "5. 安装新内核"
dpkg -i "${FILES[@]}" || {
    echo "   错误：内核安装失败"
    exit 1
}

echo "6. 生成 initramfs"
update-initramfs -c -k all 2>/dev/null || echo "   警告：initramfs 更新可能存在问题"

echo "7. 配置启动文件"
rm -f /boot/initramfs /boot/linux.efi

latest_initrd=$(ls -t /boot/initrd.img-* 2>/dev/null | head -1)
if [ -n "$latest_initrd" ]; then
    mv "$latest_initrd" /boot/initramfs
    echo "   initramfs: $(basename "$latest_initrd")"
else
    echo "   警告：未找到 initrd.img"
fi

latest_vmlinuz=$(ls -t /boot/vmlinuz-* 2>/dev/null | head -1)
if [ -n "$latest_vmlinuz" ]; then
    mv "$latest_vmlinuz" /boot/linux.efi
    echo "   linux.efi: $(basename "$latest_vmlinuz")"
else
    echo "   警告：未找到 vmlinuz"
fi

echo "8. 验证"
if [ -f "/boot/initramfs" ] && [ -f "/boot/linux.efi" ]; then
    echo "   ✓ 启动文件就绪"
    ls -lh /boot/initramfs /boot/linux.efi | awk '{print "     " $9 " (" $5 ")"}'
else
    echo "   ✗ 启动文件缺失"
    exit 1
fi

echo "9. 清理"
rm -f "${FILES[@]}" *.aria2

echo "=== 更新完成，执行 reboot 重启 ==="
