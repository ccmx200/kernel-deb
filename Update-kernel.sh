#!/bin/bash
# ==============================================
#  小米 Raphael (K20 Pro) 内核自动更新脚本
#  版本: 2.1  优化: 日志表情、连接数修复、错误日志
# ==============================================
set -e

# ---------- 配置 ----------
BASE_URL="https://up-kernel.cuicanmx.cn"
FILES=(
    "linux-image-xiaomi-raphael.deb"
    "linux-headers-xiaomi-raphael.deb"
    "firmware-xiaomi-raphael.deb"
    "alsa-xiaomi-raphael.deb"
)
MAX_RETRIES=3
CONNECTIONS=16          # 并行连接数 (1~16，推荐16，稳定优先)
WORK_DIR="/tmp"
TIMESTAMP=$(date +%s)
LOG_FILE="/tmp/kernel_update_error.log"

# 颜色定义（终端支持时生效）
if [ -t 1 ]; then
    GREEN='\033[0;32m'
    RED='\033[0;31m'
    YELLOW='\033[1;33m'
    CYAN='\033[0;36m'
    NC='\033[0m'
else
    GREEN=''; RED=''; YELLOW=''; CYAN=''; NC=''
fi

echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   🐧 小米 Raphael 内核更新脚本     ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"

# ---------- 1. 权限与空间检查 ----------
echo -e "\n🔐 ${CYAN}[1/11] 权限与空间检查...${NC}"
[ "$(id -u)" -eq 0 ] || { echo -e "${RED}❌ 请使用 root 权限运行！${NC}"; exit 1; }
AVAILABLE=$(df -BM --output=avail "$WORK_DIR" | tail -1 | tr -d 'M')
if [ "$AVAILABLE" -lt 200 ]; then
    echo -e "${RED}❌ 工作目录空间不足 (仅 ${AVAILABLE}MB，需要至少200MB)${NC}"
    exit 1
fi
echo -e "   📂 工作目录: $WORK_DIR"
echo -e "   💾 可用空间: ${AVAILABLE}MB ${GREEN}✅ 充足${NC}"
cd "$WORK_DIR" || { echo -e "${RED}❌ 无法进入 $WORK_DIR${NC}"; exit 1; }

# ---------- 2. 下载工具准备 ----------
echo -e "\n🔧 ${CYAN}[2/11] 下载工具准备...${NC}"
if ! command -v aria2c &>/dev/null; then
    echo -e "   ⚙️ 正在安装 aria2..."
    if apt-get install -y aria2 &>/dev/null; then
        echo -e "   ${GREEN}✅ aria2 安装成功${NC}"
    else
        apt-get update -qq && apt-get install -y -qq aria2 || {
            echo -e "   ${YELLOW}⚠️  aria2 安装失败，将使用 wget 下载${NC}"
        }
    fi
fi
rm -f *.aria2 2>/dev/null || true
# 清除上一次残留日志
> "$LOG_FILE"

# ---------- 下载函数（带表情 + 错误日志）----------
download_with_aria2() {
    local file=$1 url="${BASE_URL}/${file}" retry=0
    while [ $retry -lt $MAX_RETRIES ]; do
        echo -e "   ⬇️  [$(($retry+1))/$MAX_RETRIES] 下载 $file ..."
        aria2c -x $CONNECTIONS -s $CONNECTIONS -k 4M \
            --max-tries=2 --timeout=60 --retry-wait=5 \
            --console-log-level=error --summary-interval=0 \
            -o "$file" "$url" 2>>"$LOG_FILE"
        if [ -f "$file" ] && [ -s "$file" ]; then
            echo -e "   ${GREEN}✅ $file 下载完成${NC}"
            return 0
        fi
        retry=$((retry+1))
        echo -e "   ${YELLOW}🔄 下载失败，等待 ${retry} 秒后重试...${NC}"
        rm -f "$file" "$file.aria2"
        sleep $((retry * 2))
    done
    echo -e "   ${RED}❌ $file 下载失败（已重试 $MAX_RETRIES 次）${NC}"
    return 1
}

download_with_wget() {
    local file=$1 url="${BASE_URL}/${file}" retry=0
    while [ $retry -lt $MAX_RETRIES ]; do
        echo -e "   ⬇️  [$(($retry+1))/$MAX_RETRIES] 下载 $file ..."
        wget --tries=3 --timeout=60 -q -O "$file" "$url" 2>>"$LOG_FILE"
        if [ -f "$file" ] && [ -s "$file" ]; then
            echo -e "   ${GREEN}✅ $file 下载完成${NC}"
            return 0
        fi
        retry=$((retry+1))
        echo -e "   ${YELLOW}🔄 下载失败，等待 ${retry} 秒后重试...${NC}"
        rm -f "$file"
        sleep $((retry * 2))
    done
    echo -e "   ${RED}❌ $file 下载失败（已重试 $MAX_RETRIES 次）${NC}"
    return 1
}

# ---------- 3. 批量下载 ----------
echo -e "\n📦 ${CYAN}[3/11] 开始下载内核包 (共${#FILES[@]}个)${NC}"
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
if [ $failed -ne 0 ]; then
    echo -e "\n${RED}❌ 部分文件下载失败！错误日志: $LOG_FILE${NC}"
    rm -f "${FILES[@]}" *.aria2
    exit 1
fi
echo -e "   ${GREEN}🎉 所有文件下载完成！${NC}"

# ---------- 4. 文件验证 ----------
echo -e "\n🔍 ${CYAN}[4/11] 验证下载文件完整性...${NC}"
all_ok=true
for file in "${FILES[@]}"; do
    if [ -s "$file" ]; then
        echo -e "   ${GREEN}✅ $file (${GREEN}$(du -h "$file" | cut -f1)${NC})"
    else
        echo -e "   ${RED}❌ $file 缺失或大小为0${NC}"
        all_ok=false
    fi
done
$all_ok || exit 1

# ---------- 5. 备份当前启动文件 ----------
echo -e "\n💾 ${CYAN}[5/11] 备份当前启动文件...${NC}"
backup_initramfs=""
backup_linuxefi=""
if [ -f /boot/initramfs ]; then
    cp /boot/initramfs /boot/initramfs.bak.$TIMESTAMP
    backup_initramfs=/boot/initramfs.bak.$TIMESTAMP
    echo -e "   📋 initramfs → ${backup_initramfs##*/}"
fi
if [ -f /boot/linux.efi ]; then
    cp /boot/linux.efi /boot/linux.efi.bak.$TIMESTAMP
    backup_linuxefi=/boot/linux.efi.bak.$TIMESTAMP
    echo -e "   📋 linux.efi → ${backup_linuxefi##*/}"
fi

# ---------- 6. 卸载旧内核及相关包 ----------
echo -e "\n🧹 ${CYAN}[6/11] 卸载旧 sm8150 内核及相关包...${NC}"
OLD_PKGS=$(dpkg -l 2>/dev/null | grep -E 'linux-(image|headers)-.*sm8150|firmware-xiaomi-raphael|alsa-xiaomi-raphael' | awk '{print $2}' | tr '\n' ' ')
if [ -n "$OLD_PKGS" ]; then
    echo -e "   📦 发现旧包: ${YELLOW}$OLD_PKGS${NC}"
    dpkg --purge --force-all $OLD_PKGS 2>/dev/null || true
    # 二次清理
    REMAIN=$(dpkg -l 2>/dev/null | grep -E 'linux-(image|headers)-.*sm8150' | awk '{print $2}')
    for pkg in $REMAIN; do
        dpkg --force-all -P "$pkg" 2>/dev/null || true
    done
    echo -e "   ${GREEN}✅ 旧包清理完毕${NC}"
else
    echo -e "   ℹ️  未发现旧内核包"
fi

echo -e "   🗑️  清理 /lib/modules 全部残留模块..."
rm -rf /lib/modules/*

# ---------- 7. 安装依赖 ----------
echo -e "\n📎 ${CYAN}[7/11] 安装必要依赖...${NC}"
apt-get update -qq
if apt-get install -y -qq alsa-ucm-conf; then
    echo -e "   ${GREEN}✅ alsa-ucm-conf 已安装${NC}"
else
    echo -e "   ${YELLOW}⚠️  alsa-ucm-conf 安装失败（可能影响音频）${NC}"
fi

# ---------- 8. 安装内核包 ----------
echo -e "\n⚙️  ${CYAN}[8/11] 安装新内核 (共${#FILES[@]}个包)${NC}"
if dpkg -i "${FILES[@]}" 2>>"$LOG_FILE"; then
    echo -e "   ${GREEN}✅ 内核包安装成功${NC}"
else
    echo -e "   ${YELLOW}⚠️  首次安装有问题，尝试修复依赖...${NC}"
    if apt-get install -f -y 2>>"$LOG_FILE"; then
        echo -e "   ${GREEN}✅ 依赖修复完成${NC}"
    else
        echo -e "   ${YELLOW}⚠️  普通修复失败，尝试强制安装...${NC}"
        if dpkg -i --force-all "${FILES[@]}" 2>>"$LOG_FILE"; then
            echo -e "   ${GREEN}✅ 强制安装成功${NC}"
        else
            echo -e "${RED}❌ 安装彻底失败！恢复备份中...${NC}"
            [ -n "$backup_initramfs" ] && mv "$backup_initramfs" /boot/initramfs
            [ -n "$backup_linuxefi" ] && mv "$backup_linuxefi" /boot/linux.efi
            exit 1
        fi
    fi
fi

# ---------- 9. 检测新内核版本 ----------
echo -e "\n🔎 ${CYAN}[9/11] 检测新内核版本...${NC}"
NEW_VER=$(ls -1 /lib/modules/ 2>/dev/null | tail -1)
[ -n "$NEW_VER" ] || { echo -e "${RED}❌ 未找到内核模块目录！${NC}"; exit 1; }
echo -e "   🐧 内核版本: ${GREEN}$NEW_VER${NC}"

# ---------- 10. 生成 initramfs ----------
echo -e "\n🖥️  ${CYAN}[10/11] 生成 initramfs...${NC}"
if command -v update-initramfs &>/dev/null; then
    update-initramfs -c -k "$NEW_VER"
    echo -e "   ${GREEN}✅ initramfs 生成成功${NC}"
else
    echo -e "   ${YELLOW}⚠️  未找到 update-initramfs，跳过${NC}"
fi

# ---------- 11. 配置启动文件 ----------
echo -e "\n🚀 ${CYAN}[11/11] 配置启动文件...${NC}"
rm -f /boot/initramfs /boot/linux.efi
INITRD="/boot/initrd.img-${NEW_VER}"
VMLINUZ="/boot/vmlinuz-${NEW_VER}"

if [ -f "$INITRD" ]; then
    mv "$INITRD" /boot/initramfs
else
    FALLBACK=$(ls -t /boot/initrd.img-* 2>/dev/null | head -1)
    if [ -n "$FALLBACK" ]; then
        mv "$FALLBACK" /boot/initramfs
    else
        echo -e "${RED}❌ 找不到 initrd 文件！${NC}"; exit 1
    fi
fi

if [ -f "$VMLINUZ" ]; then
    mv "$VMLINUZ" /boot/linux.efi
else
    FALLBACK=$(ls -t /boot/vmlinuz-* 2>/dev/null | head -1)
    if [ -n "$FALLBACK" ]; then
        mv "$FALLBACK" /boot/linux.efi
    else
        echo -e "${RED}❌ 找不到 vmlinuz 文件！${NC}"; exit 1
    fi
fi

echo -e "   ${GREEN}✅ /boot/initramfs 与 /boot/linux.efi 已就绪${NC}"
echo -e "   ${GREEN}✅ 系统可引导${NC}"

# ---------- 清理 ----------
echo -e "\n🧼 清理临时文件..."
rm -f "${FILES[@]}" *.aria2 /boot/initramfs.bak.* /boot/linux.efi.bak.* 2>/dev/null || true

echo -e "\n${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  🎉 内核更新完成！请执行 reboot 重启至新内核  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo -e "ℹ️  如有异常，查看错误日志: ${YELLOW}$LOG_FILE${NC}"