#!/bin/bash
# Update major version tag (e.g., v1) to point to latest minor/patch release
#
# Usage: ./scripts/update-major-tag.sh <version>
# Example: ./scripts/update-major-tag.sh v1.1.0
#
# This ensures that users referencing @v1 get the latest v1.x.x release

set -e

VERSION=${1}
if [ -z "$VERSION" ]; then
    echo "Usage: $0 <version>"
    echo "Example: $0 v1.1.0"
    exit 1
fi

# Validate version format
if ! echo "$VERSION" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "Error: Invalid version format. Expected format: vX.Y.Z (e.g., v1.1.0)"
    exit 1
fi

# Extract major version (v1.1.0 -> v1)
MAJOR_TAG=$(echo "$VERSION" | grep -oE '^v[0-9]+')

echo "🏷️  Updating $MAJOR_TAG to point to $VERSION"

# Verify the version tag exists
if ! git rev-parse "$VERSION" >/dev/null 2>&1; then
    echo "Error: Tag $VERSION does not exist"
    exit 1
fi

# Delete old major tag locally
if git rev-parse "$MAJOR_TAG" >/dev/null 2>&1; then
    echo "   Deleting old $MAJOR_TAG tag locally"
    git tag -d "$MAJOR_TAG"
fi

# Create new major tag pointing to the version
echo "   Creating $MAJOR_TAG tag pointing to $VERSION"
git tag "$MAJOR_TAG" "$VERSION"

# Push with force to update remote
echo "   Pushing $MAJOR_TAG to origin (force)"
git push origin "$MAJOR_TAG" --force

echo "✅ $MAJOR_TAG now points to $VERSION"
echo ""
echo "Users can now reference this action with:"
echo "  uses: aiaugmentedsoftwaredevelopment/github-actions-redis-cache@$MAJOR_TAG"
