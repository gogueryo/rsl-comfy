import os
import subprocess
import fnmatch
import folder_paths
import shutil

class FastImageVideoStitch:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "file_path": ("STRING", {"default": "", "multiline": False}),
                "file_prefix": ("STRING", {"default": "*", "multiline": False}),
                "file_extension": ("STRING", {"default": ".mp4", "multiline": False}),
                "output_filename": ("STRING", {"default": "final_stitched.mp4", "multiline": False}),
                "fps": ("INT", {"default": 24, "min": 1, "max": 120}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("status_message",)
    FUNCTION = "stitch_files"
    CATEGORY = "rsl/utils"
    OUTPUT_NODE = True

    def stitch_files(self, file_path, file_prefix, file_extension, output_filename, fps):
        base_output_dir = folder_paths.get_output_directory()
        
        # If blank, dot, or root, target the main ComfyUI output directory
        if not file_path or file_path.strip() in ["", ".", "./"]:
            target_dir = base_output_dir
        elif os.path.isabs(file_path):
            target_dir = file_path
        else:
            target_dir = os.path.join(base_output_dir, file_path)

        if not os.path.exists(target_dir):
            return (f"Error: Directory '{target_dir}' does not exist.",)

        ext_str = file_extension.strip()
        if ext_str != "*" and not ext_str.startswith("."):
            ext_str = f".{ext_str}"

        try:
            all_files = os.listdir(target_dir)
        except Exception as e:
            return (f"Error reading directory: {str(e)}",)

        matched_files = []
        for f in all_files:
            prefix_match = fnmatch.fnmatch(f, f"{file_prefix}*") if file_prefix != "*" else True
            ext_match = f.endswith(ext_str) if ext_str != "*" else True

            if prefix_match and ext_match:
                matched_files.append(f)

        matched_files.sort()

        if not matched_files:
            return (f"Error: No files matched prefix '{file_prefix}' and extension '{file_extension}' in {target_dir}.",)

        output_full_path = os.path.join(target_dir, output_filename)
        video_extensions = (".mp4", ".mkv", ".avi", ".mov", ".webm")
        is_video = any(f.lower().endswith(video_extensions) for f in matched_files)

        # Locate ffmpeg safely
        ffmpeg_bin = "ffmpeg"
        if shutil.which("ffmpeg") is None:
            try:
                import imageio_ffmpeg
                exe = imageio_ffmpeg.get_ffmpeg_exe()
                if os.path.exists(exe):
                    ffmpeg_bin = exe
            except ImportError:
                pass

        try:
            if is_video:
                list_file_path = os.path.join(target_dir, "filelist_temp.txt")
                with open(list_file_path, "w") as lf:
                    for filename in matched_files:
                        lf.write(f"file '{filename}'\n")

                cmd = [
                    ffmpeg_bin, "-y", "-f", "concat", "-safe", "0",
                    "-i", list_file_path, "-c", "copy", output_full_path
                ]
                subprocess.run(cmd, check=True)

                if os.path.exists(list_file_path):
                    os.remove(list_file_path)

                return (f"Success! Stitched {len(matched_files)} video chunks into {output_full_path}",)
            else:
                list_file_path = os.path.join(target_dir, "imagelist_temp.txt")
                with open(list_file_path, "w") as lf:
                    for filename in matched_files:
                        lf.write(f"file '{filename}'\n")
                        lf.write(f"duration {1.0 / fps}\n")
                    if matched_files:
                        lf.write(f"file '{matched_files[-1]}'\n")

                cmd = [
                    ffmpeg_bin, "-y", "-f", "concat", "-safe", "0",
                    "-i", list_file_path, "-vsync", "vfr",
                    "-pix_fmt", "yuv420p", output_full_path
                ]
                subprocess.run(cmd, check=True)

                if os.path.exists(list_file_path):
                    os.remove(list_file_path)

                return (f"Success! Compiled {len(matched_files)} images into video {output_full_path} at {fps} FPS",)

        except subprocess.CalledProcessError as cpe:
            return (f"FFmpeg Execution Error: {str(cpe)}. Ensure ffmpeg is installed.",)
        except Exception as e:
            return (f"Error: {str(e)}",)

NODE_CLASS_MAPPINGS = {
    "FastImageVideoStitch": FastImageVideoStitch
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "FastImageVideoStitch": "Fast Image/Video Stitcher"
}

WEB_DIRECTORY = "js"