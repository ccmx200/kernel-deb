# Xiaomi Raphael (Redmi K20 Pro) Linux 内核构建与更新

本项目用于为 Xiaomi Raphael (Redmi K20 Pro) 设备构建和更新自定义 Linux 内核。

## 功能特性

- 自动编译自定义 Linux 内核
- 打包固件 (firmware) 和 ALSA 音频配置
- 一键更新内核脚本
- GitHub Actions 自动构建和发布

## 内核构建

### 工作流说明

本项目使用 GitHub Actions 自动构建内核。工作流配置：

- **运行环境**: Ubuntu 24.04 ARM
- **编译器**: LLVM/Clang 21
- **默认内核版本**: 7.0 (可自定义)
- **输出产物**:
  - `linux-image-xiaomi-raphael.deb` - 内核镜像包
  - `linux-headers-xiaomi-raphael.deb` - 内核头文件包
  - `firmware-xiaomi-raphael.deb` - 设备固件包
  - `alsa-xiaomi-raphael.deb` - ALSA 音频配置包

### 手动触发构建

1. 进入 GitHub 仓库的 **Actions** 页面
2. 选择 **内核编译** 工作流
3. 点击 **Run workflow**
4. 输入要构建的内核版本（如 `7.0`）
5. 点击运行

构建完成后，产物将自动发布到 GitHub Release。

## 内核更新

### 一键更新脚本

**⚠️ 重要提示：请使用 root 账户执行脚本，避免权限错误！**

#### 方式一：直接使用 GitHub 原始链接

```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/ccmx200/kernel-deb/refs/heads/main/Update-kernel.sh)"
```

#### 方式二：使用 ghproxy 加速（国内推荐）

```bash
sudo bash -c "$(curl -fsSL https://ghfast.top/https://raw.githubusercontent.com/ccmx200/kernel-deb/refs/heads/main/Update-kernel.sh)"
```

### 脚本功能

更新脚本会自动执行以下操作：

1. 下载最新内核包（image、headers、firmware、alsa）
2. 卸载旧版本内核
3. 安装新版本内核
4. 生成 initramfs 镜像
5. 配置启动文件（initramfs、linux.efi）
6. 清理临时文件

### 更新示例

成功执行后，你将看到类似输出：

```bash
11. 显示/boot目录内容
总计 83932
drwx------  5 root root     4096  1月  1  1970 .
drwxr-xr-x 24 root root     4096 10月  6 13:16 ..
-rwx------  1 root root   245936 12月  5 00:03 config-7.0.y-sm8150-xxxxxxxxxxxxx
drwx------  2 root root     4096 12月  3 15:50 dtbs
drwx------  3 root root     4096 11月 22 21:35 efi
-rwx------  1 root root 70902608 12月  5 11:31 initramfs
-rwx------  1 root root 14766592 12月  5 00:03 linux.efi
drwx------  3 root root     4096 11月 22 21:35 loader
=== 验证启动文件 ===
✓ 验证成功：
  - /boot/initramfs 文件存在
  - /boot/linux.efi 文件存在

文件详细信息：
-rwx------ 1 root root 68M 12月  5 11:31 /boot/initramfs
-rwx------ 1 root root 15M 12月  5 00:03 /boot/linux.efi
12. 清理下载的文件
=== 脚本执行完成 ===
```

### 重启设备

更新完成后，重启设备即可使用新内核：

```bash
reboot
```

## 项目结构

```
kernel-deb/
├── .github/
│   └── workflows/
│       └── 编译kernel.yml    # GitHub Actions 工作流
├── firmware-xiaomi-raphael/  # 固件包构建目录
├── alsa-xiaomi-raphael/      # ALSA 配置包构建目录
├── raphael-kernel_build.sh   # 内核构建脚本
├── Update-kernel.sh          # 设备端更新脚本
├── builddeb.patch            # builddeb 补丁
└── README.md                 # 本文件
```

## 内核源码

本项目使用的内核源码来自：[GengWei1997/linux](https://github.com/GengWei1997/linux)

分支命名格式：`raphael-<版本号>`（如 `raphael-7.0`）

## 发布地址

- GitHub Releases: [点击查看](https://github.com/ccmx200/kernel-deb/releases)
- 镜像站点: `https://up-kernel.cuicanmx.cn/`

## 注意事项

1. 更新内核前请备份重要数据
2. 确保设备电量充足（建议 50% 以上）
3. 更新过程中请勿强制重启或断电
4. 如遇到问题，可通过恢复模式恢复系统

## 许可证

本项目遵循 GPL 许可证。

## 致谢

- 内核源码：[GengWei1997/linux](https://github.com/GengWei1997/linux)
- Xiaomi Raphael 社区贡献者
