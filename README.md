// MTO WEBSCANNER DIRECT PRINT GUIDE //
Updated: 2026-10-01

The launchers mtoprint.bat and mto_background_print.vbs start the same two services:
  1. python print.py
  2. ngrok http --url=sandfish-construct-alone.ngrok-free.dev 5000

Both use C:\Users\LG\Desktop as the working folder. The active server file must be
C:\Users\LG\Desktop\print.py. The copy named print_updated.py in this kit is
not started by either launcher. If you want to use that version, copy it to the
Desktop and name the copy print.py before starting a launcher.
-----------------------------------------------------------------------------------------------------
// One time setup //

  1. Install Python and Ngrok (this last one in the microsoft store). Make sure "python" and "ngrok" run from Command Prompt.
  
  2. Sign in at https://dashboard.ngrok.com/get-started/setup/windows and COPY your authtoken.

  2.1 In Command Prompt run: "ngrok config add-authtoken YOUR_TOKEN[PASTE_THE_COPIED_TOKEN_HERE]"
        (1-keep in the comand even "add-authtoken", 2-take off "[ ]" )

  3. Set the exact 40x25 and 60x38 printer names in the active "Desktop\print.py".
     The local print server uses port 5000.
-----------------------------------------------------------------------------------------------------
// Starting direct print //

  - Double-click mtoprint.bat to see the Python and Ngrok terminal windows.

  - Double-click mto_background_print.vbs to run those same commands with the
    terminal windows hidden.
       ( ! ) It shows a message if Desktop\print.py is missing.
       ( ! ) Use only one launcher at a time. Running both can cause a port or tunnel conflict.
-----------------------------------------------------------------------------------------------------
Start automatically with Windows
  1. Press Windows+R, type "shell:startup", and press Enter.
  2. Place a shortcut to mto_background_print.vbs in that Startup folder.
     Keep the original VBS file in this kit.
-----------------------------------------------------------------------------------------------------
To change gate names in the Android app, edit
app/src/main/java/com/example/ui/SendPrintWorkerDialog.kt in Android Studio.
