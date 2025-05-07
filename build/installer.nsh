!macro customInstall
  # Capabilities
  WriteRegStr HKCU "Software\Meru\Capabilities" "ApplicationName" "Meru"
  WriteRegStr HKCU "Software\Meru\Capabilities" "ApplicationDescription" "Meru"
  
  # URL Associations
  WriteRegStr HKCU "Software\Meru\Capabilities\URLAssociations" "mailto" "Meru.mailto"
  
  # Default Icon
  WriteRegStr HKCU "Software\Classes\Meru.mailto\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  
  # Shell command
  WriteRegStr HKCU "Software\Classes\Meru.mailto\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  
  # Registered Applications
  WriteRegStr HKCU "Software\RegisteredApplications" "Meru" "Software\Meru\Capabilities"
!macroend

!macro customUnInstall
  # Clean up registry entries
  DeleteRegKey HKCU "Software\Meru"
  DeleteRegKey HKCU "Software\Classes\Meru.mailto"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Meru"
!macroend