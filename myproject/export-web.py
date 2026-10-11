import json
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent
OUTPUT_FILE = PROJECT_DIR.parent / "web" / "assets" / "myproject.riv"


def remove_local_scripts(scene_file):
    tree = ET.parse(scene_file)
    root = tree.getroot()
    parents = {child: parent for parent in root.iter() for child in parent}
    drawables = list(root.iter("ScriptedDrawable"))
    script_object_ids = {
        node.get("id")
        for drawable in drawables
        for node in drawable.iter()
        if node.get("id")
    }
    assets = list(root.findall("ScriptAsset"))
    if not drawables or not assets:
        raise RuntimeError("The source scene contains no local script effects to omit.")

    animation_tracks = [
        node for node in root.iter("KeyedObject")
        if node.get("objectId") in script_object_ids
    ]
    for node in drawables + assets + animation_tracks:
        parents[node].remove(node)
    tree.write(scene_file, encoding="utf-8", xml_declaration=False)


def build_web_scene():
    with tempfile.TemporaryDirectory(prefix="cursed-arcana-web-") as temporary:
        project_copy = Path(temporary) / "myproject"
        shutil.copytree(
            PROJECT_DIR,
            project_copy,
            ignore=shutil.ignore_patterns("build", "__pycache__", "*.pyc"),
        )
        remove_local_scripts(project_copy / "scene.rml")
        for pattern in ("*.as", "*.luau", "*.wgsl"):
            for script_source in project_copy.glob(pattern):
                script_source.unlink()
        subprocess.run(["rive", ".", "--once"], cwd=project_copy, check=True)
        inspection = subprocess.run(
            ["rive", "inspect", ".", "--summary"],
            cwd=project_copy,
            check=True,
            capture_output=True,
            text=True,
        )
        summary = json.loads(inspection.stdout)
        drawable_count = sum(
            board.get("types", {}).get("ScriptedDrawable", 0)
            for board in summary.get("artboards", [])
        )
        asset_count = summary.get("roots", {}).get("types", {}).get("ScriptAsset", 0)
        if drawable_count or asset_count:
            raise RuntimeError("The web scene still contains local script effects.")

        built_file = project_copy / "build" / "myproject.riv"
        if not built_file.is_file():
            raise RuntimeError(f"Rive did not produce the expected artifact: {built_file}")
        OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(built_file, OUTPUT_FILE)

    print(f"Created shader-free web scene: {OUTPUT_FILE}")


if __name__ == "__main__":
    build_web_scene()
