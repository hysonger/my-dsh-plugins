-- DSH Open — 在 DeepSeek Harness 中打开 Finder 当前目录或拖入的项目。
--
-- 由 macos/app/build-app.sh 用 osacompile 编译为 droplet；
-- 构建时会把下方占位符替换为 dsh-open 的实际绝对路径。
--
-- 行为：
--   on run   —— 点击 Finder 工具栏图标 / 直接启动时：取 Finder 前窗口的目标目录
--               （兜底：当前选中项 → 桌面），在 DSH 中打开。
--   on open  —— 拖放文件/文件夹到图标，或经“打开方式”调用时：目录直接打开，
--               文件打开其父目录。

property dshOpenBin : "__DSH_OPEN_BIN__"

on openInDSH(posixPath)
	-- 文件 → 父目录；目录 → 自身。
	do shell script "f=" & quoted form of posixPath & "; if [ -d \"$f\" ]; then " & (quoted form of dshOpenBin) & " \"$f\"; else " & (quoted form of dshOpenBin) & " \"$(dirname \"$f\")\"; fi"
end openInDSH

on run
	set targetPath to ""
	-- 优先取 Finder 前窗口的目标目录；特殊位置（最近使用/AirDrop 等）会抛错，走兜底。
	try
		tell application "Finder"
			if (count of Finder windows) > 0 then
				set targetPath to POSIX path of (target of front Finder window as alias)
			end if
		end tell
	end try
	-- 无窗口或取目标失败时，退而求其次用当前选中项（覆盖桌面选中场景）。
	if targetPath is "" then
		try
			tell application "Finder"
				if (count of (get selection)) > 0 then
					set targetPath to POSIX path of ((item 1 of (get selection)) as alias)
				end if
			end tell
		end try
	end if
	-- 最终兜底：桌面。
	if targetPath is "" then set targetPath to POSIX path of (path to desktop folder)
	my openInDSH(targetPath)
end run

on open droppedItems
	repeat with anItem in droppedItems
		my openInDSH(POSIX path of anItem)
	end repeat
end open
