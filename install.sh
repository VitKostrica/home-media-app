#!/bin/bash
# Home Media Center Installation Script
# Makes the app accessible from Debian's applications menu and CLI

APP_DIR="/home/kostra/Custom-apps/home-media-app"
LAUNCHER="$APP_DIR/home-media-app"
DESKTOP_FILE="$APP_DIR/home-media-app.desktop"
APPS_DIR="$HOME/.local/share/applications"
BIN_DIR="$HOME/.local/bin"

echo "Installing Home Media Center..."

# Make launcher executable
chmod +x "$LAUNCHER"
echo "✓ Launcher script made executable"

# Create directories if they don't exist
mkdir -p "$APPS_DIR"
mkdir -p "$BIN_DIR"

# Copy/link .desktop file to applications menu
cp "$DESKTOP_FILE" "$APPS_DIR/"
echo "✓ Desktop file installed to $APPS_DIR"

# Create symlink in ~/.local/bin for CLI access
ln -sf "$LAUNCHER" "$BIN_DIR/home-media-app"
echo "✓ Symlink created: $BIN_DIR/home-media-app"

# Update desktop database (optional, helps some DMs)
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database "$APPS_DIR"
    echo "✓ Desktop database updated"
fi

echo ""
echo "Installation complete!"
echo ""
echo "To launch the app:"
echo "  • Click 'Home Media Center' in your applications menu"
echo "  • Or run: home-media-app"
echo "  • Or run: $LAUNCHER"
echo ""
echo "To uninstall:"
echo "  rm $APPS_DIR/home-media-app.desktop"
echo "  rm $BIN_DIR/home-media-app"
