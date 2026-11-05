import os
import cv2
import subprocess
import json
import folder_paths
from server import PromptServer

class RSLQueueStopper:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "source_video": ("STRING", {"default": "", "multiline": False}),
                "current_skip_frame": ("INT", {"default": 0, "min": 0, "max": 10000000}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("status_message", "video_path")
    FUNCTION = "check_and_stop"
    CATEGORY = "rsl/utils"
    OUTPUT_NODE = True

    def get_accurate_frame_count(self, video_path):
        # Try ffprobe first for absolute accuracy
        try:
            cmd = [
                "ffprobe", "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=nb_frames,duration",
                "-of", "json", video_path
            ]
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
            data = json.loads(result.stdout)
            stream = data.get("streams", [{}])[0]
            
            if "nb_frames" in stream and stream["nb_frames"]:
                return int(stream["nb_frames"])
            
            if "duration" in stream:
                duration = float(stream["duration"])
                cap = cv2.VideoCapture(video_path)
                fps = cap.get(cv2.CAP_PROP_FPS)
                cap.release()
                if fps > 0:
                    return int(round(duration * fps))
        except Exception:
            pass

        # Fallback to OpenCV property
        cap = cv2.VideoCapture(video_path)
        if cap.isOpened():
            total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            cap.release()
            if total > 0:
                return total

        return 0

    def check_and_stop(self, source_video, current_skip_frame):
        source_video = source_video.strip()
        if not source_video:
            return ("Error: No video path provided.", "")

        input_dir = folder_paths.get_input_directory()
        output_dir = folder_paths.get_output_directory()
        
        if os.path.isabs(source_video):
            video_path = source_video
        else:
            cand_input = os.path.join(input_dir, source_video)
            cand_output = os.path.join(output_dir, source_video)
            if os.path.exists(cand_input):
                video_path = cand_input
            elif os.path.exists(cand_output):
                video_path = cand_output
            else:
                video_path = os.path.abspath(source_video)

        if not os.path.exists(video_path):
            return (f"Error: Could not find video at: {video_path}", source_video)

        total_frames = self.get_accurate_frame_count(video_path)
        
        if total_frames <= 0:
            return (f"Error: Could not read frame count for {video_path}", video_path)

        # Core logic: If start/skip frame is greater than or equal to total frames, stop the queue!
        if current_skip_frame >= total_frames:
            try:
                if PromptServer.instance and PromptServer.instance.prompt_queue:
                    PromptServer.instance.prompt_queue.clear()
            except Exception as e:
                print(f"[RSLQueueStopper] Error clearing queue: {e}")
                
            return (f"🛑 QUEUE STOPPED: Skip Frame ({current_skip_frame}) has reached or exceeded Total Video Frames ({total_frames}).", video_path)
        else:
            return (f"▶️ Processing... Skip Frame: {current_skip_frame} | Total Video Frames: {total_frames}", video_path)

NODE_CLASS_MAPPINGS = {
    "RSLQueueStopper": RSLQueueStopper
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RSLQueueStopper": "rsl Queue Stopper & Video Info"
}