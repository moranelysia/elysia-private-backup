"""本机 FunASR 常驻工作进程：stdin/stdout 使用单行 JSON 协议。"""
import contextlib
import json
import os
import sys
import time


def emit(value):
    sys.__stdout__.write(json.dumps(value, ensure_ascii=False) + "\n")
    sys.__stdout__.flush()


def memory_mb():
    try:
        import psutil
        return round(psutil.Process(os.getpid()).memory_info().rss / 1024 / 1024, 1)
    except Exception:
        try:
            import ctypes
            from ctypes import wintypes

            class PROCESS_MEMORY_COUNTERS(ctypes.Structure):
                _fields_ = [
                    ("cb", wintypes.DWORD),
                    ("PageFaultCount", wintypes.DWORD),
                    ("PeakWorkingSetSize", ctypes.c_size_t),
                    ("WorkingSetSize", ctypes.c_size_t),
                    ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                    ("PagefileUsage", ctypes.c_size_t),
                    ("PeakPagefileUsage", ctypes.c_size_t),
                ]

            kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
            psapi = ctypes.WinDLL("psapi", use_last_error=True)
            kernel32.GetCurrentProcess.restype = wintypes.HANDLE
            psapi.GetProcessMemoryInfo.argtypes = [
                wintypes.HANDLE,
                ctypes.POINTER(PROCESS_MEMORY_COUNTERS),
                wintypes.DWORD,
            ]
            psapi.GetProcessMemoryInfo.restype = wintypes.BOOL
            counters = PROCESS_MEMORY_COUNTERS()
            counters.cb = ctypes.sizeof(counters)
            handle = kernel32.GetCurrentProcess()
            if psapi.GetProcessMemoryInfo(handle, ctypes.byref(counters), counters.cb):
                return round(counters.WorkingSetSize / 1024 / 1024, 1)
        except Exception:
            pass
        return 0


def main():
    if len(sys.argv) < 3:
        raise RuntimeError("缺少 GPT-SoVITS 根目录或运行设备")
    root = os.path.abspath(sys.argv[1])
    device = sys.argv[2]
    models = os.path.join(root, "tools", "asr", "models")
    paths = {
        "model": os.path.join(models, "speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch"),
        "vad_model": os.path.join(models, "speech_fsmn_vad_zh-cn-16k-common-pytorch"),
        "punc_model": os.path.join(models, "punc_ct-transformer_zh-cn-common-vocab272727-pytorch"),
    }
    missing = [key for key, path in paths.items() if not os.path.isdir(path)]
    if missing:
        raise RuntimeError("缺少本地模型：" + ", ".join(missing))

    # FunASR 的依赖会输出进度和提示；协议 stdout 必须只保留 JSON。
    with contextlib.redirect_stdout(sys.stderr):
        from funasr import AutoModel
        model = AutoModel(
            **paths,
            device=device,
            disable_update=True,
            model_revision="v2.0.4",
            vad_model_revision="v2.0.4",
            punc_model_revision="v2.0.4",
        )
    emit({"type": "ready", "device": device, "memoryMB": memory_mb()})

    for line in sys.stdin:
        try:
            request = json.loads(line)
            request_id = str(request.get("id", ""))
            audio_path = os.path.abspath(str(request.get("path", "")))
            if not request_id or not os.path.isfile(audio_path):
                raise ValueError("录音文件不存在")
            started = time.time()
            with contextlib.redirect_stdout(sys.stderr):
                result = model.generate(input=audio_path)
            text = ""
            if result and isinstance(result[0], dict):
                text = str(result[0].get("text", "")).strip()
            emit({
                "type": "result",
                "id": request_id,
                "ok": bool(text),
                "text": text,
                "seconds": round(time.time() - started, 3),
                "memoryMB": memory_mb(),
            })
        except Exception as error:
            emit({"type": "result", "id": request.get("id", "") if "request" in locals() else "", "ok": False, "error": str(error)[:300]})


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit({"type": "fatal", "error": str(error)[:500]})
        raise
