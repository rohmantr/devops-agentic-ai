import os
import asyncio
import subprocess
import time
import shlex
from typing import Dict, Any, Union, List


class SandboxManager:
    def __init__(self):
        self.use_fallback = True
        self.client = None
        if os.path.exists("/var/run/docker.sock"):
            try:
                import docker

                self.client = docker.from_env()
                self.client.ping()
                self.use_fallback = False
            except Exception:
                self.use_fallback = True
        else:
            self.use_fallback = True

    def run_in_sandbox_sync(
        self, agent_type: str, command: Union[str, List[str]], timeout: int = 300
    ) -> Dict[str, Any]:
        if self.use_fallback or self.client is None:
            try:
                if isinstance(command, str):
                    if "&&" in command or ";" in command or "||" in command:
                        raise ValueError("Shell injection detected")
                    cmd_list = shlex.split(command)
                else:
                    cmd_list = command
                cmd_list = [os.path.expandvars(arg) for arg in cmd_list]
                res = subprocess.run(
                    cmd_list,
                    shell=False,
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                )
                return {"exit_code": res.returncode, "output": res.stdout + res.stderr}
            except subprocess.TimeoutExpired:
                return {"exit_code": -1, "output": "[ERROR] Execution timed out."}
            except Exception as e:
                return {"exit_code": -1, "output": f"Failed to run fallback: {str(e)}"}

        image_name = f"agent-sandbox-{agent_type}:latest"
        try:
            container = self.client.containers.run(
                image=image_name,
                command=command,
                detach=True,
                mem_limit="512m",
                cpu_period=100000,
                cpu_quota=50000,
                network_mode="none",
                remove=False,
            )
            exit_code = -1
            logs = ""
            start_time = time.time()
            while True:
                container.reload()
                status = container.status
                if status == "exited":
                    result = container.wait()
                    exit_code = result.get("StatusCode", 0)
                    logs = container.logs().decode(errors="replace")
                    break
                if time.time() - start_time > timeout:
                    try:
                        container.kill()
                    except Exception:
                        pass
                    exit_code = -1
                    logs = (
                        container.logs().decode(errors="replace")
                        + "\n[ERROR] Execution timed out."
                    )
                    break
                time.sleep(1)
            try:
                container.remove(force=True)
            except Exception:
                pass
            return {"exit_code": exit_code, "output": logs}
        except Exception as e:
            return {"exit_code": -1, "output": f"Failed to run sandbox: {str(e)}"}

    async def run_in_sandbox(
        self, agent_type: str, command: Union[str, List[str]], timeout: int = 300
    ) -> Dict[str, Any]:
        return await asyncio.to_thread(
            self.run_in_sandbox_sync, agent_type, command, timeout
        )
