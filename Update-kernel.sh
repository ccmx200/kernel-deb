#!/bin/bash
set -e

BASE_URL="https://up-kernel.cuicanmx.cn"
FILES=(
    "linux-image-xiaomi-raphael.deb"
    "linux-headers-xiaomi-raphael.deb"
    "firmware-xiaomi-raphael.deb"
    "alsa-xiaomi-raphael.deb"
)

check_error() {
    if [ $? -ne 0 ]; then
        echo "错误：$1"
        exit 1
    fi
}

download_file() {
    local file=$1
    echo "   下载 $file..."
    wget -q --show-progress "${BASE_URL}/${file}" -O "${file}"
    check_error "$file 下载失败"
}

echo "=== 开始更新内核 ==="

cd /tmp || exit 1

echo "1. 下载内核包 (${#FILES[@]}个)"
for file in "${FILES[@]}"; do
    download_file "$file"
done

echo "2. 卸载旧内核"
dpkg -l 2>/dev/null | grep -E "linux-(headers|image)-xiaomi|linux-xiaomi-raphael" | awk '{print $2}' | xargs -r dpkg -P 2>/dev/null || true
rm -rf /lib/modules/*

echo "3. 安装新内核"
dpkg -i "${FILES[@]}"
check_error "内核安装失败"

echo "4. 生成 initramfs"
update-initramfs -c -k all 2>/dev/null || echo "   警告：initramfs 更新可能存在问题"

echo "5. 配置启动文件"
rm -f /boot/initramfs /boot/linux.efi

latest_initrd=$(ls -t /boot/initrd.img-* 2>/dev/null | head -1)
if [ -n "$latest_initrd" ]; then
    mv "$latest_initrd" /boot/initramfs
    echo "   initramfs: $(basename $latest_initrd)"
else
    echo "   警告：未找到 initrd.img"
fi

latest_vmlinuz=$(ls -t /boot/vmlinuz-* 2>/dev/null | head -1)
if [ -n "$latest_vmlinuz" ]; then
    mv "$latest_vmlinuz" /boot/linux.efi
    echo "   linux.efi: $(basename $latest_vmlinuz)"
else
    echo "   警告：未找到 vmlinuz"
fi

echo "6. 验证"
if [ -f "/boot/initramfs" ] && [ -f "/boot/linux.efi" ]; then
    echo "   ✓ 启动文件就绪"
    ls -lh /boot/initramfs /boot/linux.efi | awk '{print "     " $9 " (" $5 ")"}'
else
    echo "   ✗ 启动文件缺失"
    exit 1
fi

echo "7. 清理"
rm -f "${FILES[@]}"

echo "=== 更新完成，执行 reboot 重启 ==="
