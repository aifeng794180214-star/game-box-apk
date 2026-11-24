#!/bin/bash
# ============================================================
#  game-box-apk 离线构建脚本（无 Gradle）
#  aapt2 -> javac -> d8 -> 合并 dex -> zipalign -> apksigner
#  用法： bash build_apk.sh
#  产物： 桌面/游戏小游戏合集.apk
# ============================================================
set -e
export JAVA_HOME="C:/Program Files/Android/Android Studio/jbr"
JAVA="$JAVA_HOME/bin/java.exe"
JAVAC="$JAVA_HOME/bin/javac.exe"

SDK="C:/Users/22066/AppData/Local/Android/Sdk"
BT="$SDK/build-tools/36.0.0"
AJ="$SDK/platforms/android-37.0/android.jar"
P="C:/Users/22066/Desktop/game-box-apk"
OUT="C:/Users/22066/Desktop/游戏小游戏合集.apk"

cd "$P/android"
rm -rf build/gen build/classes build/dex build/res.zip build/base.apk build/aligned.apk
mkdir -p build/gen build/classes build/dex build/assets

echo "== [1/7] 同步 www -> assets/www"
rm -rf build/assets/www
mkdir -p build/assets/www
cp -r "$P/www/." build/assets/www/
# 只打包大厅与 6 款正式游戏，排除草稿页
rm -f build/assets/www/hexa.html build/assets/www/screw.html build/assets/www/neon.html
ls build/assets/www

echo "== [2/7] aapt2 compile"
"$BT/aapt2.exe" compile --dir res -o build/res.zip

echo "== [3/7] aapt2 link"
"$BT/aapt2.exe" link -o build/base.apk -I "$AJ" \
  --manifest AndroidManifest.xml -R build/res.zip \
  --java build/gen -A build/assets --auto-add-overlay

echo "== [4/7] javac"
find src build/gen -name "*.java" > build/sources.txt
"$JAVAC" -source 11 -target 11 -nowarn -encoding UTF-8 \
  -classpath "$AJ" -d build/classes @"build/sources.txt"

echo "== [5/7] d8 -> dex"
find build/classes -name "*.class" > build/classlist.txt
"$JAVA" -Xmx1024M -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 \
  --lib "$AJ" --min-api 24 --output build/dex @"build/classlist.txt"

echo "== [6/7] 合并 classes.dex"
python - <<'PY'
import zipfile, os, shutil
base = r'C:\Users\22066\Desktop\game-box-apk\android\build\base.apk'
dex  = r'C:\Users\22066\Desktop\game-box-apk\android\build\dex\classes.dex'
tmp = base + '.tmp'
with zipfile.ZipFile(base) as zin, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
    for it in zin.infolist():
        zout.writestr(it, zin.read(it.filename), it.compress_type)
    zout.write(dex, 'classes.dex', zipfile.ZIP_DEFLATED)
shutil.move(tmp, base)
print('   merged ->', os.path.getsize(base), 'bytes')
PY

echo "== [7/7] zipalign + 签名"
"$BT/zipalign.exe" -f -p 4 build/base.apk build/aligned.apk
if [ ! -f debug.keystore ]; then
  echo "!! 缺少 debug.keystore，无法覆盖安装（签名变更会导致安装失败）"
  exit 1
fi
# 口令不写入仓库：从环境变量读取（本地可放在被 .gitignore 忽略的 .ksenv 中）
if [ -z "${KS_PASS:-}" ]; then
  echo "!! 未设置 KS_PASS 环境变量（签名口令）。请先在本地执行： source ../.ksenv"
  exit 1
fi
"$JAVA" -jar "$BT/lib/apksigner.jar" sign \
  --ks debug.keystore --ks-pass env:KS_PASS --key-pass env:KEY_PASS \
  --ks-key-alias "${KS_ALIAS:-androiddebugkey}" \
  --out "$OUT" build/aligned.apk
"$JAVA" -jar "$BT/lib/apksigner.jar" verify --print-certs "$OUT" | head -5
ls -lh "$OUT"
echo "BUILD_OK"
