#!/bin/bash
# Starts a virtual display, the accessibility bus, and Orca, then drives the
# browser and copies Orca's spoken output to /out/speech.txt.
set -u
export DISPLAY=:99 NO_AT_BRIDGE=0 ACCESSIBILITY_ENABLED=1 GTK_MODULES=gail:atk-bridge
Xvfb :99 -screen 0 1280x900x24 >/dev/null 2>&1 &
sleep 1
eval "$(dbus-launch --sh-syntax)"
/usr/libexec/at-spi-bus-launcher --launch-immediately >/dev/null 2>&1 &
sleep 1
gsettings set org.gnome.desktop.interface toolkit-accessibility true 2>/dev/null
speech-dispatcher -d >/dev/null 2>&1 || true
orca --replace --debug-file /tmp/orca.log >/dev/null 2>&1 &
sleep 6
NODE_PATH=/frontend/node_modules node /orca/drive.cjs
status=$?
sleep 2
grep "SPEECH OUTPUT" /tmp/orca.log | sed -E "s/^.*SPEECH OUTPUT: '//; s/' \{.*$//" > /out/speech.txt
exit $status
