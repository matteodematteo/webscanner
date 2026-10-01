Option Explicit

Dim WshShell, FSO, PrintFolder
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

' Match mtoprint.bat: run the active print.py from the Desktop.
PrintFolder = "C:\Users\LG\Desktop"
If Not FSO.FileExists(FSO.BuildPath(PrintFolder, "print.py")) Then
    MsgBox "Cannot find " & FSO.BuildPath(PrintFolder, "print.py") & vbCrLf & _
        "Copy your active print.py there before starting the print system.", _
        vbCritical, "Printing System Launcher"
    WScript.Quit 1
End If
WshShell.CurrentDirectory = PrintFolder

' Run asynchronously and keep the console windows hidden.
WshShell.Run "cmd.exe /c python print.py", 0, False
WshShell.Run "cmd.exe /c ngrok http --url=[NGROK_URL] 5000", 0, False

' REPLACE "[NGROK_URL]" with the url of ngrok, keep the final 5000
