#!/bin/bash
# Install Home Media Center for all users (system-wide)
# Run with: sudo ./install-system-wide.sh
#
# Installs to /opt/home-media-app and adds a menu entry for every user.

set -e

APP_NAME="home-media-app"
INSTALL_DIR="/opt/$APP_NAME"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_FILE="/usr/share/applications/$APP_NAME.desktop"

if [[ $EUID -ne 0 ]]; then
    echo "Run this script as root: sudo $0"
    exit 1
fi

echo "Installing Home Media Center for all users..."
echo "  From: $SOURCE_DIR"
echo "  To:   $INSTALL_DIR"

# Build if needed so production files are present
if [[ ! -d "$SOURCE_DIR/dist" ]]; then
    echo "Building app (dist/ not found)..."
    (cd "$SOURCE_DIR" && npm run build)
fi

# Copy entire app
echo "Copying files..."
mkdir -p "$INSTALL_DIR"
if command -v rsync &>/dev/null; then
    rsync -a --delete \
        --exclude node_modules/.cache \
        --exclude .git \
        "$SOURCE_DIR/" "$INSTALL_DIR/"
else
    rm -rf "$INSTALL_DIR"
    cp -a "$SOURCE_DIR" "$INSTALL_DIR"
    rm -rf "$INSTALL_DIR/.git" 2>/dev/null || true
fi

# Ensure node_modules exist in destination (copy includes them)
if [[ ! -x "$INSTALL_DIR/node_modules/.bin/electron" ]]; then
    echo "Installing npm dependencies in $INSTALL_DIR..."
    (cd "$INSTALL_DIR" && npm install --omit=dev)
fi

# Allow all users to read and execute; owner can write (for future updates)
chown -R root:root "$INSTALL_DIR"
chmod -R a+rX "$INSTALL_DIR"
chmod a+x "$INSTALL_DIR/home-media-app"

# Install desktop file (path in Exec must be the installed location)
cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Home Media Center
Comment=TV-like media center with Jellyfin integration
Exec=$INSTALL_DIR/home-media-app %U
Icon=media-player
Terminal=false
Categories=AudioVideo;
Keywords=media;center;jellyfin;
StartupNotify=true
EOF

echo "Done. Home Media Center is now available for all users."
echo "  App:     $INSTALL_DIR"
echo "  Menu:    $DESKTOP_FILE"
echo ""
echo "To update later: run 'npm run build' in your source, then run this script again."
