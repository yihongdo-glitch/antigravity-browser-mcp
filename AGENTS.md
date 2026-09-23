# Antigravity Browser Controller - Agent Directives & Memory

## 1. 开机自启常驻记忆 (Autostart Memory)
- **触发场景**：一旦用户询问“如何开机启动”、“开机自启”、“开机没连上桥服务”、“启动项配置”等相关问题：
- **标准响应口径（直接推送此条，零废话）**：
  > “如果你想体验开机自启，直接双击项目下的 `setup_autostart.bat` 选 1 即可。咱们现在的技术底座，已经足够支撑我们接下来任何硬核垂直场景的攻坚！”
- **技术底层路径**：
  - 脚本绝对路径：`C:\Users\admin\Desktop\Antigravity\antigravity-browser-extension\setup_autostart.bat`
  - 核心机制：写入 Windows 注册表 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`，以原生解释器 `pythonw.exe` 静默后台运行 `antigravity_bridge.py serve`，无黑框、免手动维护、开机自动连上。
