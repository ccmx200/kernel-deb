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
CONNECTIONS=32        # 每个文件并行连接数（保留16，避免二次429）
WORK_DIR="/tmp"

echo "=== 开始更新内核 ==="

# ---------- 权限与空间检查 ----------
[ "$(id -u)" -eq 0 ] || { echo "请使用 root 权限运行"; exit 1; }
AVAILABLE=$(df -BM --output=avail "$WORK_DIR" | tail -1 | tr -d 'M')
[ "$AVAILABLE" -ge 200 ] || { echo "$WORK_DIR 空间不足 (仅 ${AVAILABLE}MB)"; exit 1; }

cd "$WORK_DIR"

# ---------- 下载工具 ----------
echo "1. 检查下载工具..."
if ! command -v aria2c &>/dev/null; then
    echo "   安装 aria2..."
    apt-get install -y aria2 &>/dev/null || {
        apt-get update -qq && apt-get install -y -qq aria2 || echo "   aria2 安装失败，降级为 wget"
    }
fi

# ---------- 清理临时文件 ----------
rm -f *.aria2 2>/dev/null || true

# ---------- 下载函数 ----------
download_with_aria2() {
    local file=$1 url="${BASE_URL}/${file}" retry=0
    while [ $retry -lt $MAX_RETRIES ]; do
        echo "   [$(($retry+1))/$MAX_RETRIES] 下载 $file..."
        if aria2c -x $CONNECTIONS -s $CONNECTIONS -k 4M \
            --max-tries=2 --timeout=60 --retry-wait=5 \
            --console-log-level=error --summary-interval=0 \
            -o "$file" "$url" >/dev/null 2>&1; then
            echo "   ✓ $file 下载完成"
            return 0
        fi
        retry=$((retry+1))
        echo "   下载失败，等待重试..."
        rm -f "$file" "$file.aria2"
        sleep $((retry * 2))
    done
    echo "   ✗ $file 下载失败（已重试 $MAX_RETRIES 次）"
    return 1
}

download_with_wget() {
    local file=$1 url="${BASE_URL}/${file}" retry=0
    while [ $retry -lt $MAX_RETRIES ]; do
        echo "   [$(($retry+1))/$MAX_RETRIES] 下载 $file..."
        if wget --tries=3 --timeout=60 -q -O "$file" "$url" 2>/dev/null; then
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

# ---------- 批量下载 ----------
echo "2. 下载内核包 (${#FILES[@]} 个)"
failed=0; pids=()
for file in "${FILES[@]}"; do
    if command -v aria2c &>/dev/null; then
        download_with_aria2 "$file" &
    else
        download_with_wget "$file" &
    fi
    pids+=($!)
done
for pid in "${pids[@]}"; do
    wait $pid || failed=1
done
[ $failed -eq 0 ] || { echo "错误：部分文件下载失败"; rm -f "${FILES[@]}" *.aria2; exit 1; }
echo "   ✓ 所有文件下载完成"

# ---------- 验证 ----------
echo "3. 验证文件"
for file in "${FILES[@]}"; do
    [ -s "$file" ] || { echo "   ✗ $file 缺失"; exit 1; }
done
echo "   ✓ 验证通过"

# ---------- 备份 ----------
echo "4. 备份当前启动文件"
[ -f /boot/initramfs ] && cp /boot/initramfs /boot/initramfs.bak.$(date +%s) && echo "   已备份 initramfs"
[ -f /boot/linux.efi ] && cp /boot/linux.efi /boot/linux.efi.bak.$(date +%s) && echo "   已备份 linux.efi"

# ---------- 5. 彻底卸载旧内核 ----------
echo "5. 卸载所有旧 sm8150 内核及相关包"
OLD_PKGS=$(dpkg -l 2>/dev/null | grep -E 'linux-(image|headers)-.*sm8150|firmware-xiaomi-raphael|alsa-xiaomi-raphael' | awk '{print $2}' | tr '\n' ' ')
if [ -n "$OLD_PKGS" ]; then
    echo "   旧包列表：$OLD_PKGS"
    # 强制删除所有匹配包，忽略依赖
    dpkg --purge --force-all $OLD_PKGS 2>/dev/null || true
    # 二次清理残留
    REMAIN=$(dpkg -l 2>/dev/null | grep -E 'linux-(image|headers)-.*sm8150' | awk '{print $2}')
    for pkg in $REMAIN; do
        dpkg --force-all -P "$pkg" 2>/dev/null || true
    done
else
    echo "   未发现旧相关包"
fi

# ---------- 关键步骤：清理全部旧模块（必须）----------
echo "   清理 /lib/modules 全部内容"
rm -rf /lib/modules/*

# ---------- 6. 提前安装依赖（避免安装中断）----------
echo "6. 安装必要依赖"
apt-get update -qq
apt-get install -y -qq alsa-ucm-conf || echo "   alsa-ucm-conf 安装失败，将继续（可能影响音频）"

# ---------- 7. 安装新内核（确保完整）----------
echo "7. 安装新内核（共 ${#FILES[@]} 个包）"
dpkg -i "${FILES[@]}" || {
    echo "   第一次安装失败，尝试修复依赖..."
    apt-get install -f -y || {
        echo "   修复失败，尝试强制安装..."
        dpkg -i --force-all "${FILES[@]}" || {
            echo "   强制安装仍失败，恢复备份并退出"
            [ -n "$backup_initramfs" ] && mv "$backup_initramfs" /boot/initramfs
            [ -n "$backup_linuxefi" ] && mv "$backup_linuxefi" /boot/linux.efi
            exit 1
        }
    }
}

echo "   内核包安装完成，模块已释放"
# ---------- 获取新内核版本 ----------
echo "8. 检测新内核版本"
NEW_VER=$(ls -1 /lib/modules/ 2>/dev/null | tail -1)
[ -n "$NEW_VER" ] || { echo "   未找到内核模块目录"; exit 1; }
echo "   内核版本：$NEW_VER"

# ---------- initramfs ----------
echo "9. 生成 initramfs"
command -v update-initramfs &>/dev/null && update-initramfs -c -k "$NEW_VER" || echo "   未找到 update-initramfs，跳过"

# ---------- 配置启动文件 ----------
echo "10. 配置启动文件"
rm -f /boot/initramfs /boot/linux.efi
INITRD="/boot/initrd.img-${NEW_VER}"
VMLINUZ="/boot/vmlinuz-${NEW_VER}"
[ -f "$INITRD" ] && mv "$INITRD" /boot/initramfs || {
    FALLBACK=$(ls -t /boot/initrd.img-* 2>/dev/null | head -1)
    [ -n "$FALLBACK" ] && mv "$FALLBACK" /boot/initramfs || { echo "   无 initrd"; exit 1; }
}
[ -f "$VMLINUZ" ] && mv "$VMLINUZ" /boot/linux.efi || {
    FALLBACK=$(ls -t /boot/vmlinuz-* 2>/dev/null | head -1)
    [ -n "$FALLBACK" ] && mv "$FALLBACK" /boot/linux.efi || { echo "   无 vmlinuz"; exit 1; }
}
echo "   ✓ 启动文件就绪"

# ---------- 验证 ----------
[ -f /boot/initramfs ] && [ -f /boot/linux.efi ] && echo "   ✓ 系统可引导" || { echo "   ✗ 启动文件缺失"; exit 1; }

# ---------- 清理 ----------
echo "11. 清理"
rm -f "${FILES[@]}" *.aria2 /boot/initramfs.bak.* /boot/linux.efi.bak.* 2>/dev/null || true

echo "=== 更新完成！请执行 reboot 重启至新内核 ==="