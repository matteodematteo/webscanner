Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

' 1. Automatically find the exact folder where this .vbs file is saved
CurrentFolder = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = CurrentFolder

' 2. Run Python server completely hidden (0 means hidden)
WshShell.Run "cmd /c python print.py", 0, False

' 3. Run Ngrok tunnel completely hidden (0 means hidden)
WshShell.Run "cmd /c ngrok http --url=sandfish-construct-alone.ngrok-free.dev 5000", 0, False