bl_info = {
    "name": "Pixel Bug Blender Bridge",
    "author": "Pixel Bug",
    "version": (1, 3, 29),
    "blender": (3, 6, 0),
    "location": "View3D > Sidebar > PixelBug",
    "description": "Imports and updates Pixel Bug voxel models with exact armatures.",
    "category": "Import-Export",
}

import json
import math
import os
import struct
import bpy
from bpy_extras.io_utils import ImportHelper
from bpy.props import BoolProperty, EnumProperty, FloatProperty, StringProperty


# File limits
MAX_JSON_BYTES = 64 * 1024 * 1024
MAX_GLB_BYTES = 512 * 1024 * 1024
MAX_GLB_JSON_BYTES = 16 * 1024 * 1024
MAX_CUBES = 3200000
MAX_STROKES = 500000
MAX_POINTS = 2000000
MAX_FRAMES = 240


# Path tools
def safe_pack_target(base_directory, target):
    value = str(target or "")
    if not value or len(value) > 240 or os.path.isabs(value):
        raise ValueError("Pack file entry is not valid.")
    root = os.path.realpath(base_directory)
    resolved = os.path.realpath(os.path.join(root, value))
    try:
        inside = os.path.commonpath([root, resolved]) == root
    except ValueError:
        inside = False
    if not inside or os.path.splitext(resolved)[1].lower() != ".json":
        raise ValueError("Pack file entry leaves the selected folder.")
    return resolved


def load_json_file(filepath, allowed_root=None):
    resolved = os.path.realpath(filepath)
    if allowed_root:
        root = os.path.realpath(allowed_root)
        try:
            inside = os.path.commonpath([root, resolved]) == root
        except ValueError:
            inside = False
        if not inside:
            raise ValueError("JSON file leaves the selected folder.")
    if os.path.splitext(resolved)[1].lower() != ".json":
        raise ValueError("Only JSON files can be imported here.")
    size = os.path.getsize(resolved)
    if size < 1 or size > MAX_JSON_BYTES:
        raise ValueError("JSON file size is not supported.")
    with open(resolved, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError("JSON root must be an object.")
    return data


# Data checks
def finite_number(value):
    if isinstance(value, bool):
        return False
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


def valid_vector(value, minimum=-1000000.0, maximum=1000000.0):
    return isinstance(value, (list, tuple)) and len(value) >= 3 and all(finite_number(item) and minimum <= float(item) <= maximum for item in value[:3])


def validate_cube(cube):
    if not isinstance(cube, dict):
        raise ValueError("Voxel cube data is not valid.")
    if not valid_vector(cube.get("position", [])):
        raise ValueError("Voxel cube position is not valid.")
    if not valid_vector(cube.get("scale", []), 0.000001, 1000000.0):
        raise ValueError("Voxel cube scale is not valid.")
    color = cube.get("color", "#ffffff")
    if not isinstance(color, str) or len(color) > 64:
        raise ValueError("Voxel cube color is not valid.")


def validate_stroke(stroke):
    if not isinstance(stroke, dict) or not isinstance(stroke.get("points", []), list):
        raise ValueError("Stroke data is not valid.")
    color = stroke.get("color", "#ffffff")
    if not isinstance(color, str) or len(color) > 64:
        raise ValueError("Stroke color is not valid.")
    for point in stroke.get("points", []):
        if not valid_vector(point):
            raise ValueError("Stroke point data is not valid.")


def validate_import_data(data):
    cubes = data.get("cubes", [])
    strokes = data.get("strokes", [])
    frames = data.get("frames", [])
    if not isinstance(cubes, list) or len(cubes) > MAX_CUBES:
        raise ValueError("Voxel cube count is not supported.")
    if not isinstance(strokes, list) or len(strokes) > MAX_STROKES:
        raise ValueError("Stroke count is not supported.")
    if not isinstance(frames, list) or len(frames) > MAX_FRAMES:
        raise ValueError("Animation frame count is not supported.")
    for cube in cubes:
        validate_cube(cube)
    point_count = 0
    for stroke in strokes:
        validate_stroke(stroke)
        point_count += len(stroke.get("points", []))
        if point_count > MAX_POINTS:
            raise ValueError("Stroke point count is not supported.")
    frame_cubes = 0
    frame_points = 0
    for frame in frames:
        if not isinstance(frame, dict):
            raise ValueError("Animation frame data is not valid.")
        item_cubes = frame.get("cubes", [])
        item_strokes = frame.get("strokes", [])
        if not isinstance(item_cubes, list) or not isinstance(item_strokes, list):
            raise ValueError("Animation frame data is not valid.")
        frame_cubes += len(item_cubes)
        if frame_cubes > MAX_CUBES:
            raise ValueError("Animation cube count is not supported.")
        for cube in item_cubes:
            validate_cube(cube)
        for stroke in item_strokes:
            validate_stroke(stroke)
            frame_points += len(stroke.get("points", []))
            if frame_points > MAX_POINTS:
                raise ValueError("Animation point count is not supported.")
    return data


# Color tools
def hex_to_rgba(value):
    clean = str(value or "#ffffff").strip().lstrip("#")
    if len(clean) != 6:
        return (1.0, 1.0, 1.0, 1.0)
    try:
        return tuple(int(clean[index:index + 2], 16) / 255 for index in (0, 2, 4)) + (1.0,)
    except ValueError:
        return (1.0, 1.0, 1.0, 1.0)


# Material tools
def material_for_color(hex_color, emission=False):
    name = f"PB_{str(hex_color).strip().lstrip('#').upper()}"
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.diffuse_color = hex_to_rgba(hex_color)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    shader = nodes.get("Principled BSDF")
    if shader:
        rgba = hex_to_rgba(hex_color)
        shader.inputs["Base Color"].default_value = rgba
        if "Emission Color" in shader.inputs:
            shader.inputs["Emission Color"].default_value = rgba if emission else (0.0, 0.0, 0.0, 1.0)
        if "Emission Strength" in shader.inputs:
            shader.inputs["Emission Strength"].default_value = 0.35 if emission else 0.0
    return material


# Mesh tools
def create_cube_mesh(name, cubes, bevel=0.0, emission=False):
    vertices = []
    faces = []
    material_slots = []
    for cube in cubes:
        center_x, center_y, center_z = cube.get("position", [0, 0, 0])
        size_x, size_y, size_z = cube.get("scale", [1, 1, 1])
        x0, x1 = center_x - size_x / 2, center_x + size_x / 2
        y0, y1 = center_y - size_y / 2, center_y + size_y / 2
        z0, z1 = center_z - size_z / 2, center_z + size_z / 2
        start = len(vertices)
        vertices.extend([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)])
        faces.extend([(start, start + 1, start + 2, start + 3), (start + 4, start + 7, start + 6, start + 5), (start, start + 4, start + 5, start + 1), (start + 1, start + 5, start + 6, start + 2), (start + 2, start + 6, start + 7, start + 3), (start + 3, start + 7, start + 4, start)])
        material_slots.extend([cube.get("color", "#ffffff")] * 6)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    colors = []
    for color in material_slots:
        if color not in colors:
            colors.append(color)
            obj.data.materials.append(material_for_color(color, emission))
    index_map = {color: index for index, color in enumerate(colors)}
    for polygon, color in zip(obj.data.polygons, material_slots):
        polygon.material_index = index_map[color]
    if bevel > 0:
        modifier = obj.modifiers.new("Pixel Bug Bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        obj.modifiers.new("Pixel Bug Weighted Normals", "WEIGHTED_NORMAL")
    return obj


# Point tools
def create_point_carrier(name, cubes):
    mesh = bpy.data.meshes.new(name)
    vertices = [tuple(cube.get("position", [0, 0, 0])) for cube in cubes]
    mesh.from_pydata(vertices, [], [])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj["pixelbug_hint"] = "Use these vertices as Geometry Nodes points. Scale, color, and depth arrays are stored as custom properties."
    obj["pb_scales"] = [value for cube in cubes for value in cube.get("scale", [1, 1, 1])]
    obj["pb_colors"] = [cube.get("color", "#ffffff") for cube in cubes]
    obj["pb_depths"] = [cube.get("depth", 1) for cube in cubes]
    try:
        obj.modifiers.new("Pixel Bug Geometry Nodes", "NODES")
    except Exception:
        pass
    return obj


# Stroke tools
def create_curve_strokes(name, strokes, emission=False, parent=None):
    collection = bpy.data.collections.new(name)
    if parent:
        parent.children.link(collection)
    else:
        bpy.context.scene.collection.children.link(collection)
    for index, stroke in enumerate(strokes, start=1):
        curve = bpy.data.curves.new(f"PB_Stroke_{stroke.get('id', index)}", "CURVE")
        curve.dimensions = "3D"
        curve.resolution_u = 1
        curve.fill_mode = "FULL"
        curve.bevel_depth = 0.015
        spline = curve.splines.new("POLY")
        points = stroke.get("points", [])
        spline.points.add(max(0, len(points) - 1))
        for point, coordinate in zip(spline.points, points):
            point.co = (coordinate[0], coordinate[1], coordinate[2], 1.0)
        obj = bpy.data.objects.new(curve.name, curve)
        obj.data.materials.append(material_for_color(stroke.get("color", "#ffffff"), emission))
        collection.objects.link(obj)
    return collection


# Grease tools
def create_grease_reference(name, strokes, emission=False, frames=None):
    if frames:
        root = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(root)
        for item in frames:
            frame_collection = create_curve_strokes(f"{name}_Frame_{item.get('index', 0) + 1}", item.get("strokes", []), emission, root)
            hidden = item.get("index", 0) != 0
            frame_collection.hide_viewport = hidden
            frame_collection.hide_render = hidden
        return root
    return create_curve_strokes(name, strokes, emission)


# GLB tools
def read_glb_json(filepath):
    file_size = os.path.getsize(filepath)
    if file_size < 20 or file_size > MAX_GLB_BYTES:
        raise ValueError("The GLB file size is not supported.")
    with open(filepath, "rb") as handle:
        header = handle.read(12)
        if len(header) != 12:
            raise ValueError("The GLB header is incomplete.")
        magic, version, length = struct.unpack("<III", header)
        if magic != 0x46546C67 or version != 2:
            raise ValueError("The file is not a glTF 2.0 binary.")
        if length != file_size:
            raise ValueError("The GLB length does not match the file size.")
        while handle.tell() < length:
            remaining = length - handle.tell()
            if remaining < 8:
                raise ValueError("The GLB chunk header is incomplete.")
            chunk_header = handle.read(8)
            chunk_length, chunk_type = struct.unpack("<II", chunk_header)
            if chunk_length > length - handle.tell():
                raise ValueError("The GLB chunk length is invalid.")
            if chunk_type == 0x4E4F534A and chunk_length > MAX_GLB_JSON_BYTES:
                raise ValueError("The GLB JSON chunk is too large.")
            payload = handle.read(chunk_length)
            if len(payload) != chunk_length:
                raise ValueError("The GLB chunk is incomplete.")
            if chunk_type == 0x4E4F534A:
                data = json.loads(payload.decode("utf-8").rstrip(" \t\r\n\0"))
                if not isinstance(data, dict):
                    raise ValueError("The GLB JSON root is not an object.")
                return data
    raise ValueError("The GLB does not contain a JSON chunk.")


def pixelbug_manifest(filepath):
    data = read_glb_json(filepath)
    manifest = data.get("extras", {}).get("pixelBug")
    if isinstance(manifest, dict) and manifest.get("format") == "pixelbug-armature":
        return manifest
    return None


def normalized_path(filepath):
    return os.path.normcase(os.path.abspath(bpy.path.abspath(filepath or ""))) if filepath else ""


def imported_objects(before):
    return [obj for obj in bpy.data.objects if obj.as_pointer() not in before]


def import_glb(filepath):
    before = {obj.as_pointer() for obj in bpy.data.objects}
    result = bpy.ops.import_scene.gltf(
        filepath=filepath,
        disable_bone_shape=True,
        bone_heuristic="FORTUNE",
        guess_original_bind_pose=False,
        import_scene_extras=True,
    )
    if "FINISHED" not in result:
        raise RuntimeError("Blender could not import the GLB file.")
    return imported_objects(before)


# Armature tools
def vector_close(first, second, tolerance=0.0001):
    return all(abs(float(first[index]) - float(second[index])) <= tolerance for index in range(3))


def set_object_mode():
    active = bpy.context.view_layer.objects.active
    if active and active.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def apply_exact_armature(armature, manifest):
    bones = manifest.get("bones", []) if manifest else []
    if not armature or not bones:
        return {}
    existing_names = {}
    for data_bone in armature.data.bones:
        bone_id = str(data_bone.get("pixelbug_bone_id", ""))
        if bone_id:
            existing_names[bone_id] = data_bone.name
    set_object_mode()
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    edit_bones = armature.data.edit_bones
    created = {}
    rename_map = {}
    retained = set()
    for item in bones:
        bone_id = str(item.get("id", ""))
        name = str(item.get("name") or item.get("sourceName") or "Bone")[:63]
        previous_name = existing_names.get(bone_id, name)
        bone = edit_bones.get(previous_name) or edit_bones.get(name) or edit_bones.new(name)
        old_name = bone.name
        bone.name = name
        if old_name != bone.name:
            rename_map[old_name] = bone.name
        retained.add(bone.name)
        bone.parent = None
        bone.use_connect = False
        head = item.get("headBlender", [0, 0, 0])
        tail = item.get("tailBlender", [0, 0, 1])
        bone.head = tuple(float(value) for value in head[:3])
        bone.tail = tuple(float(value) for value in tail[:3])
        if (bone.tail - bone.head).length < 0.0001:
            bone.tail.z += 0.1
        bone.roll = math.radians(float(item.get("rollDegrees", 0.0)))
        bone.use_deform = bool(item.get("deform", True))
        created[bone_id or bone.name] = bone
    for edit_bone in list(edit_bones):
        if edit_bone.name not in retained:
            edit_bones.remove(edit_bone)
    for item in bones:
        bone = created.get(str(item.get("id", "")))
        parent = created.get(str(item.get("parentBoneId", "")))
        if not bone:
            continue
        if parent:
            bone.parent = parent
            connected = bool(item.get("connected", False)) and vector_close(bone.head, parent.tail)
            bone.use_connect = connected
            if connected:
                bone.head = parent.tail
        bone.roll = math.radians(float(item.get("rollDegrees", 0.0)))
    bpy.ops.object.mode_set(mode="OBJECT")
    for item in bones:
        data_bone = armature.data.bones.get(str(item.get("name") or item.get("sourceName") or "Bone")[:63])
        if data_bone:
            data_bone["pixelbug_bone_id"] = str(item.get("id", ""))
            data_bone["pixelbug_part_id"] = str(item.get("partId", ""))
            data_bone.use_deform = bool(item.get("deform", True))
    armature.data.display_type = "OCTAHEDRAL"
    armature.show_in_front = True
    armature.name = str(manifest.get("name") or "Voxel Armature")
    armature.data.name = armature.name
    return rename_map


def find_armature(objects):
    return next((obj for obj in objects if obj.type == "ARMATURE"), None)


def find_meshes(objects):
    return [obj for obj in objects if obj.type == "MESH"]


def ensure_armature_modifier(mesh, armature):
    if not mesh or not armature:
        return None
    modifier = next((item for item in mesh.modifiers if item.type == "ARMATURE"), None)
    if not modifier:
        modifier = mesh.modifiers.new("Voxel Armature", "ARMATURE")
    modifier.object = armature
    return modifier


def rename_vertex_groups(meshes, rename_map):
    if not rename_map:
        return
    for mesh in meshes:
        for old_name, new_name in rename_map.items():
            group = mesh.vertex_groups.get(old_name)
            if group and not mesh.vertex_groups.get(new_name):
                group.name = new_name


def tag_source(objects, filepath, manifest):
    source_path = normalized_path(filepath)
    source_id = str((manifest or {}).get("sourceId") or source_path)
    geometry = str((manifest or {}).get("geometry") or "")
    animation = (manifest or {}).get("animation") if isinstance((manifest or {}).get("animation"), dict) else None
    for obj in objects:
        obj["pixelbug_source_path"] = source_path
        obj["pixelbug_source_id"] = source_id
        obj["pixelbug_geometry"] = geometry
        obj["pixelbug_role"] = "armature" if obj.type == "ARMATURE" else "mesh" if obj.type == "MESH" else "object"
        if obj.type == "ARMATURE" and animation:
            obj["pixelbug_animation_name"] = str(animation.get("name") or "Voxel Armature Animation")
            obj["pixelbug_animation_frames"] = int(animation.get("frameCount") or 0)
            obj["pixelbug_animation_loop"] = str(animation.get("loopMode") or "loop")
    bpy.context.scene.pixelbug_source_path = source_path
    return source_id


def finish_glb_import(filepath, imported, manifest):
    armature = find_armature(imported)
    meshes = find_meshes(imported)
    rename_map = apply_exact_armature(armature, manifest) if armature else {}
    rename_vertex_groups(meshes, rename_map)
    for mesh in meshes:
        ensure_armature_modifier(mesh, armature)
    tag_source(imported, filepath, manifest)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    if armature:
        armature.select_set(True)
        bpy.context.view_layer.objects.active = armature
    elif meshes:
        bpy.context.view_layer.objects.active = meshes[0]
    return armature, meshes


# Source tools
def source_path(context):
    scene_path = normalized_path(getattr(context.scene, "pixelbug_source_path", ""))
    if scene_path:
        return scene_path
    active = context.active_object
    return normalized_path(active.get("pixelbug_source_path", "")) if active else ""


def source_objects(filepath, source_id=""):
    path = normalized_path(filepath)
    matches = []
    for obj in bpy.data.objects:
        object_path = normalized_path(obj.get("pixelbug_source_path", ""))
        object_id = str(obj.get("pixelbug_source_id", ""))
        if source_id and object_id == source_id:
            matches.append(obj)
        elif path and object_path == path:
            matches.append(obj)
    return matches


def remove_objects(objects):
    for obj in list(objects):
        if obj and obj.name in bpy.data.objects:
            bpy.data.objects.remove(obj, do_unlink=True)


def copy_vertex_groups(source, target):
    for group in list(target.vertex_groups):
        target.vertex_groups.remove(group)
    target_groups = [target.vertex_groups.new(name=group.name) for group in source.vertex_groups]
    for vertex in source.data.vertices:
        for membership in vertex.groups:
            if membership.group < len(target_groups):
                target_groups[membership.group].add([vertex.index], membership.weight, "REPLACE")


def replace_mesh_data(source, target, armature):
    previous_data = target.data
    target.data = source.data
    copy_vertex_groups(source, target)
    ensure_armature_modifier(target, armature)
    if previous_data and previous_data.users == 0:
        bpy.data.meshes.remove(previous_data)


def load_update_source(context):
    filepath = source_path(context)
    if not filepath or not os.path.isfile(filepath):
        raise FileNotFoundError("Choose an exported Pixel Bug GLB first.")
    manifest = pixelbug_manifest(filepath)
    if not manifest:
        raise ValueError("The source GLB does not contain Pixel Bug armature metadata.")
    source_id = str(manifest.get("sourceId") or "")
    existing = source_objects(filepath, source_id)
    return filepath, manifest, existing


def import_temporary(filepath, manifest):
    imported = import_glb(filepath)
    armature, meshes = finish_glb_import(filepath, imported, manifest)
    return imported, armature, meshes


# Bridge operators
class PIXELBUG_OT_import_glb(bpy.types.Operator, ImportHelper):
    bl_idname = "import_scene.pixelbug_glb"
    bl_label = "Import Pixel Bug GLB"
    bl_options = {"REGISTER", "UNDO"}

    filename_ext = ".glb"
    filter_glob: StringProperty(default="*.glb", options={"HIDDEN"})

    def execute(self, context):
        imported = []
        try:
            manifest = pixelbug_manifest(self.filepath)
            imported = import_glb(self.filepath)
            armature, meshes = finish_glb_import(self.filepath, imported, manifest)
        except Exception as error:
            remove_objects(imported)
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}
        if not armature or not meshes:
            self.report({"WARNING"}, "The file imported, but a mesh or armature was not found.")
        elif manifest:
            animation = manifest.get("animation") if isinstance(manifest.get("animation"), dict) else None
            animation_text = f" with {int(animation.get('frameCount') or 0)} captured pose frames" if animation else ""
            self.report({"INFO"}, f"Imported {len(meshes)} voxel mesh, rebuilt {len(manifest.get('bones', []))} exact bones{animation_text}.")
        else:
            self.report({"WARNING"}, "Imported with standard glTF armature handling because exact metadata was not found.")
        return {"FINISHED"}


class PIXELBUG_OT_reimport_geometry(bpy.types.Operator):
    bl_idname = "pixelbug.reimport_geometry"
    bl_label = "Reimport Geometry"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        imported = []
        try:
            filepath, manifest, existing = load_update_source(context)
            old_armature = find_armature(existing)
            old_meshes = find_meshes(existing)
            imported, new_armature, new_meshes = import_temporary(filepath, manifest)
            if not new_meshes:
                raise ValueError("The updated GLB has no voxel mesh.")
            if old_meshes:
                for index, old_mesh in enumerate(old_meshes):
                    source = new_meshes[min(index, len(new_meshes) - 1)]
                    replace_mesh_data(source, old_mesh, old_armature or new_armature)
                    tag_source([old_mesh], filepath, manifest)
                remove_objects(imported)
            else:
                for mesh in new_meshes:
                    ensure_armature_modifier(mesh, old_armature or new_armature)
                if old_armature and new_armature:
                    remove_objects([new_armature])
            if old_armature:
                tag_source([old_armature], filepath, manifest)
            self.report({"INFO"}, "Voxel geometry, materials, and skin weights were updated.")
            return {"FINISHED"}
        except Exception as error:
            remove_objects(imported)
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}


class PIXELBUG_OT_update_materials(bpy.types.Operator):
    bl_idname = "pixelbug.update_materials"
    bl_label = "Update Materials"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        imported = []
        try:
            filepath, manifest, existing = load_update_source(context)
            old_meshes = find_meshes(existing)
            imported, _armature, new_meshes = import_temporary(filepath, manifest)
            if not old_meshes or not new_meshes:
                raise ValueError("A current and updated voxel mesh are required.")
            for index, old_mesh in enumerate(old_meshes):
                source = new_meshes[min(index, len(new_meshes) - 1)]
                old_mesh.data.materials.clear()
                for material in source.data.materials:
                    old_mesh.data.materials.append(material)
            remove_objects(imported)
            self.report({"INFO"}, "Voxel material slots were updated.")
            return {"FINISHED"}
        except Exception as error:
            remove_objects(imported)
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}


class PIXELBUG_OT_update_armature(bpy.types.Operator):
    bl_idname = "pixelbug.update_armature"
    bl_label = "Update Armature"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        try:
            filepath, manifest, existing = load_update_source(context)
            armature = find_armature(existing)
            if not armature:
                raise ValueError("No linked Pixel Bug armature was found.")
            rename_map = apply_exact_armature(armature, manifest)
            rename_vertex_groups(find_meshes(existing), rename_map)
            tag_source([armature], filepath, manifest)
            self.report({"INFO"}, f"Rebuilt {len(manifest.get('bones', []))} exact bones.")
            return {"FINISHED"}
        except Exception as error:
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}


class PIXELBUG_OT_rebind_mesh(bpy.types.Operator):
    bl_idname = "pixelbug.rebind_mesh"
    bl_label = "Rebind Mesh"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        imported = []
        try:
            filepath, manifest, existing = load_update_source(context)
            old_meshes = find_meshes(existing)
            imported, _armature, new_meshes = import_temporary(filepath, manifest)
            if not old_meshes or not new_meshes:
                raise ValueError("A current and updated voxel mesh are required.")
            for index, old_mesh in enumerate(old_meshes):
                source = new_meshes[min(index, len(new_meshes) - 1)]
                if len(source.data.vertices) != len(old_mesh.data.vertices):
                    raise ValueError("The vertex count changed. Use Reimport Geometry instead.")
                copy_vertex_groups(source, old_mesh)
            remove_objects(imported)
            self.report({"INFO"}, "Bone skin weights were refreshed.")
            return {"FINISHED"}
        except Exception as error:
            remove_objects(imported)
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}


class PIXELBUG_OT_validate_model(bpy.types.Operator):
    bl_idname = "pixelbug.validate_model"
    bl_label = "Validate Model"

    def execute(self, context):
        try:
            filepath, manifest, existing = load_update_source(context)
            armature = find_armature(existing)
            meshes = find_meshes(existing)
            issues = []
            expected = {str(item.get("name", "")) for item in manifest.get("bones", []) if item.get("deform", True)}
            if not armature:
                issues.append("armature missing")
            if not meshes:
                issues.append("mesh missing")
            if armature:
                actual = {bone.name for bone in armature.data.bones if bone.use_deform}
                missing = expected - actual
                if missing:
                    issues.append(f"{len(missing)} deform bones missing")
            for mesh in meshes:
                if not any(modifier.type == "ARMATURE" and modifier.object == armature for modifier in mesh.modifiers):
                    issues.append(f"{mesh.name} has no linked Armature modifier")
                groups = {group.name for group in mesh.vertex_groups}
                missing_groups = expected - groups
                if missing_groups:
                    issues.append(f"{mesh.name} is missing {len(missing_groups)} vertex groups")
            if issues:
                self.report({"WARNING"}, "; ".join(issues))
            else:
                self.report({"INFO"}, f"Model is linked and valid: {len(meshes)} mesh, {len(expected)} deform bones, source {os.path.basename(filepath)}.")
            return {"FINISHED"}
        except Exception as error:
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}


class PIXELBUG_OT_open_source_folder(bpy.types.Operator):
    bl_idname = "pixelbug.open_source_folder"
    bl_label = "Open Source Folder"

    def execute(self, context):
        filepath = source_path(context)
        if not filepath:
            self.report({"ERROR"}, "Choose an exported Pixel Bug GLB first.")
            return {"CANCELLED"}
        bpy.ops.wm.path_open(filepath=os.path.dirname(filepath))
        return {"FINISHED"}


# Import operator
class PIXELBUG_OT_import_json(bpy.types.Operator, ImportHelper):
    bl_idname = "import_scene.pixelbug_json"
    bl_label = "Import Pixel Bug JSON"
    bl_options = {"REGISTER", "UNDO"}

    filename_ext = ".json"
    filter_glob: StringProperty(default="*.json", options={"HIDDEN"})
    import_mode: EnumProperty(
        name="Import Mode",
        items=(
            ("AUTO", "Auto", "Choose from the Pixel Bug file type"),
            ("MESH", "Voxel Mesh", "Create editable colored cube geometry"),
            ("POINTS", "Geometry Nodes Points", "Create a point carrier for Geometry Nodes"),
            ("BOTH", "Mesh + Points", "Create editable mesh plus point carrier"),
            ("GREASE", "Grease Pencil Reference", "Create Grease Pencil-friendly curve strokes"),
            ("ANIMATION", "Animation Frames", "Create frame collections for Pixel Bug animation data"),
        ),
        default="AUTO",
    )
    bevel_width: FloatProperty(name="Bevel Width", default=0.0, min=0.0, max=0.5)
    use_emission: BoolProperty(name="Use Emission Materials", default=False)

    def execute(self, context):
        try:
            data = load_json_file(self.filepath)
            kind = data.get("type", "")
            if kind == "pixelbug-blender-pack":
                files = data.get("files", {})
                if not isinstance(files, dict):
                    raise ValueError("Pack for Blender file entries are not valid.")
                target = files.get("greasePencil") if self.import_mode == "GREASE" else files.get("nodes")
                if not target:
                    raise ValueError("Pack for Blender is missing the requested file entry.")
                base_directory = os.path.dirname(os.path.realpath(self.filepath))
                target_path = safe_pack_target(base_directory, target)
                data = load_json_file(target_path, base_directory)
                kind = data.get("type", "")
            validate_import_data(data)
        except (OSError, ValueError, json.JSONDecodeError) as error:
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}
        cubes = data.get("cubes", [])
        strokes = data.get("strokes", [])
        if kind == "pixelbug-geometry-nodes":
            mode = self.import_mode
            frames = data.get("frames", [])
            if mode == "ANIMATION" and frames:
                root = bpy.data.collections.new("PixelBug_Animation_Frames")
                bpy.context.scene.collection.children.link(root)
                for item in frames:
                    obj = create_cube_mesh(f"PixelBug_Frame_{item.get('index', 0) + 1}", item.get("cubes", []), self.bevel_width, self.use_emission)
                    for collection in obj.users_collection:
                        collection.objects.unlink(obj)
                    root.objects.link(obj)
                    hidden = item.get("index", 0) != data.get("activeFrame", 0)
                    obj.hide_viewport = hidden
                    obj.hide_render = hidden
                return {"FINISHED"}
            if mode in {"AUTO", "BOTH"}:
                create_cube_mesh("PixelBug_Voxel_Mesh", cubes, self.bevel_width, self.use_emission)
                create_point_carrier("PixelBug_Geometry_Nodes_Points", cubes)
            elif mode == "MESH":
                create_cube_mesh("PixelBug_Voxel_Mesh", cubes, self.bevel_width, self.use_emission)
            elif mode == "POINTS":
                create_point_carrier("PixelBug_Geometry_Nodes_Points", cubes)
            else:
                self.report({"ERROR"}, "Selected mode is not valid for Geometry Nodes JSON.")
                return {"CANCELLED"}
            return {"FINISHED"}
        if kind == "pixelbug-grease-pencil":
            create_grease_reference("PixelBug_Grease_Pencil_Reference", strokes, self.use_emission, data.get("frames") if self.import_mode == "ANIMATION" else None)
            return {"FINISHED"}
        self.report({"ERROR"}, "Unsupported Pixel Bug JSON type.")
        return {"CANCELLED"}


# Sidebar panel
class PIXELBUG_PT_bridge(bpy.types.Panel):
    bl_label = "PixelBug"
    bl_idname = "PIXELBUG_PT_bridge"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PixelBug"

    def draw(self, context):
        layout = self.layout
        layout.operator(PIXELBUG_OT_import_glb.bl_idname, text="Import Model", icon="IMPORT")
        layout.prop(context.scene, "pixelbug_source_path", text="Source")
        column = layout.column(align=True)
        column.operator(PIXELBUG_OT_reimport_geometry.bl_idname, icon="FILE_REFRESH")
        column.operator(PIXELBUG_OT_update_materials.bl_idname, icon="MATERIAL")
        column.operator(PIXELBUG_OT_update_armature.bl_idname, icon="ARMATURE_DATA")
        column.operator(PIXELBUG_OT_rebind_mesh.bl_idname, icon="MOD_ARMATURE")
        layout.separator()
        row = layout.row(align=True)
        row.operator(PIXELBUG_OT_validate_model.bl_idname, icon="CHECKMARK")
        row.operator(PIXELBUG_OT_open_source_folder.bl_idname, text="Open Folder", icon="FILE_FOLDER")


# Menu tools
def menu_func_import(self, context):
    self.layout.operator(PIXELBUG_OT_import_glb.bl_idname, text="Pixel Bug GLB (.glb)")
    self.layout.operator(PIXELBUG_OT_import_json.bl_idname, text="Pixel Bug JSON (.json)")


# Register tools
CLASSES = (
    PIXELBUG_OT_import_glb,
    PIXELBUG_OT_reimport_geometry,
    PIXELBUG_OT_update_materials,
    PIXELBUG_OT_update_armature,
    PIXELBUG_OT_rebind_mesh,
    PIXELBUG_OT_validate_model,
    PIXELBUG_OT_open_source_folder,
    PIXELBUG_OT_import_json,
    PIXELBUG_PT_bridge,
)


def register():
    for cls in CLASSES:
        bpy.utils.register_class(cls)
    bpy.types.Scene.pixelbug_source_path = StringProperty(name="Pixel Bug Source", subtype="FILE_PATH")
    bpy.types.TOPBAR_MT_file_import.append(menu_func_import)


# Remove tools
def unregister():
    bpy.types.TOPBAR_MT_file_import.remove(menu_func_import)
    del bpy.types.Scene.pixelbug_source_path
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
