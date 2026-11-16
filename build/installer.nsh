!macro customUnInstall
  DeleteRegKey HKCU "Software\Meru"
  DeleteRegKey HKCU "Software\Clients\Mail\Meru"
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\Meru"
  DeleteRegKey HKCU "Software\Classes\Meru.mailto"
  DeleteRegKey HKCU "Software\Classes\Meru.url"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Meru"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Meru.url"

  # SHCNE_ASSOCCHANGED, so the shell drops Meru from its handlers. Without
  # SHCNF_FLUSH: that blocks until every shell window has handled the event,
  # which from an installer's UI thread deadlocked against Explorer.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
