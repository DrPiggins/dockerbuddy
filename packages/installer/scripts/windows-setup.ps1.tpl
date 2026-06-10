# DockerBuddy — Windows remote host setup
# Generated for: {{CONTEXT_NAME}}
# Pubkey owner:  {{KEY_COMMENT}}
#
# Renders a WPF dialog (no console). When launched by the NSIS installer it
# inherits admin; when double-clicked it self-elevates silently.

# --- Self-elevate (hidden) ---
$current = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($current)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell.exe `
        -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-WindowStyle","Hidden","-File","`"$PSCommandPath`"" `
        -Verb RunAs -WindowStyle Hidden
    exit
}

# Hide the console window of the elevated process
Add-Type -Name DbConsole -Namespace DockerBuddy -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("kernel32.dll")] public static extern System.IntPtr GetConsoleWindow();
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr hWnd, int nCmdShow);
'@
$hConsole = [DockerBuddy.DbConsole]::GetConsoleWindow()
if ($hConsole -ne [System.IntPtr]::Zero) {
    [DockerBuddy.DbConsole]::ShowWindow($hConsole, 0) | Out-Null
}

$ErrorActionPreference = 'Stop'
$logPath = Join-Path $env:TEMP 'dockerbuddy-setup.log'
function Write-Log([string]$msg) {
    try { Add-Content -Path $logPath -Value ("[{0}] {1}" -f (Get-Date -Format o), $msg) } catch {}
}
$sshPort = [int]'{{SSH_PORT}}'
if ($sshPort -lt 1 -or $sshPort -gt 65535) { $sshPort = 22 }
Write-Log "DockerBuddy setup starting (context: {{CONTEXT_NAME}}, port: $sshPort)"

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="DockerBuddy Setup" Width="640" Height="580"
        WindowStartupLocation="CenterScreen" ResizeMode="NoResize"
        Background="#0A1628" FontFamily="Segoe UI" Foreground="White">
  <Grid>
    <Grid.RowDefinitions>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="*"/>
      <RowDefinition Height="Auto"/>
    </Grid.RowDefinitions>

    <Border Grid.Row="0" Background="#0F1F35" BorderBrush="#1B3050" BorderThickness="0,0,0,1" Padding="28,22,28,22">
      <StackPanel>
        <StackPanel Orientation="Horizontal">
          <Border Width="40" Height="40" CornerRadius="10" Background="#3FB6F4" VerticalAlignment="Center">
            <TextBlock Text="DB" Foreground="#0A1628" FontSize="16" FontWeight="Bold"
                       HorizontalAlignment="Center" VerticalAlignment="Center"/>
          </Border>
          <StackPanel Margin="14,0,0,0" VerticalAlignment="Center">
            <TextBlock Text="DockerBuddy" FontSize="20" FontWeight="SemiBold" Foreground="White"/>
            <TextBlock Text="Setting up the Windows side" FontSize="12" Foreground="#6FA8E0" Margin="0,2,0,0"/>
          </StackPanel>
        </StackPanel>
        <TextBlock x:Name="ContextLabel" FontSize="11" Foreground="#4A6E94" Margin="0,12,0,0"/>
      </StackPanel>
    </Border>

    <ScrollViewer Grid.Row="1" VerticalScrollBarVisibility="Auto">
      <StackPanel x:Name="StepsPanel" Margin="32,24,32,16"/>
    </ScrollViewer>

    <Border Grid.Row="2" Background="#0F1F35" BorderBrush="#1B3050" BorderThickness="0,1,0,0" Padding="28,18,28,18">
      <Grid>
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="*"/>
          <ColumnDefinition Width="Auto"/>
        </Grid.ColumnDefinitions>
        <StackPanel Grid.Column="0" x:Name="SummaryPanel" Visibility="Collapsed" VerticalAlignment="Center">
          <TextBlock Text="CONNECTION INFO" FontSize="10" Foreground="#6FA8E0" FontWeight="SemiBold" Margin="0,0,0,6"/>
          <Grid>
            <Grid.ColumnDefinitions>
              <ColumnDefinition Width="80"/>
              <ColumnDefinition Width="Auto"/>
            </Grid.ColumnDefinitions>
            <Grid.RowDefinitions>
              <RowDefinition Height="Auto"/>
              <RowDefinition Height="Auto"/>
              <RowDefinition Height="Auto"/>
            </Grid.RowDefinitions>
            <TextBlock Grid.Row="0" Grid.Column="0" Text="IP address" Foreground="#8AA3BD" FontSize="12"/>
            <TextBlock Grid.Row="0" Grid.Column="1" x:Name="IpText" Foreground="White" FontSize="13" FontWeight="SemiBold" FontFamily="Consolas"/>
            <TextBlock Grid.Row="1" Grid.Column="0" Text="Username" Foreground="#8AA3BD" FontSize="12" Margin="0,2,0,0"/>
            <TextBlock Grid.Row="1" Grid.Column="1" x:Name="UserText" Foreground="White" FontSize="13" FontWeight="SemiBold" FontFamily="Consolas" Margin="0,2,0,0"/>
            <TextBlock Grid.Row="2" Grid.Column="0" Text="SSH port" Foreground="#8AA3BD" FontSize="12" Margin="0,2,0,0"/>
            <TextBlock Grid.Row="2" Grid.Column="1" x:Name="PortText" Foreground="White" FontSize="13" FontWeight="SemiBold" FontFamily="Consolas" Margin="0,2,0,0"/>
          </Grid>
        </StackPanel>
        <Button Grid.Column="1" x:Name="CloseButton" Content="Close" Width="120" Height="38"
                IsEnabled="False" Background="#1F3550" Foreground="#6FA8E0"
                BorderThickness="0" FontWeight="SemiBold" FontSize="13" Cursor="Hand"/>
      </Grid>
    </Border>
  </Grid>
</Window>
'@

$reader = New-Object System.Xml.XmlNodeReader ([xml]$xaml)
$window = [Windows.Markup.XamlReader]::Load($reader)

$stepsPanel  = $window.FindName('StepsPanel')
$summaryPanel = $window.FindName('SummaryPanel')
$ipText      = $window.FindName('IpText')
$userText    = $window.FindName('UserText')
$portText    = $window.FindName('PortText')
$closeButton = $window.FindName('CloseButton')
$contextLabel = $window.FindName('ContextLabel')
$contextLabel.Text = "Context: {{CONTEXT_NAME}}    ·    SSH port: $sshPort"

$closeButton.Add_Click({ $window.Close() })

function New-Brush([byte]$r, [byte]$g, [byte]$b) {
    return New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.Color]::FromRgb($r, $g, $b))
}

$brushBorderIdle  = New-Brush 40 64 92
$brushBorderRun   = New-Brush 63 182 244
$brushBorderOk    = New-Brush 74 222 128
$brushBorderSkip  = New-Brush 90 110 135
$brushBorderFail  = New-Brush 248 113 113
$brushNavyDeep    = New-Brush 10 22 40
$brushTextIdle    = New-Brush 130 150 175
$brushTextActive  = New-Brush 235 245 255
$brushTextMuted   = New-Brush 110 135 160

$steps = @{}

function Add-Step([string]$id, [string]$title) {
    $row = New-Object System.Windows.Controls.StackPanel
    $row.Orientation = 'Horizontal'
    $row.Margin = '0,0,0,18'

    $iconBorder = New-Object System.Windows.Controls.Border
    $iconBorder.Width = 28; $iconBorder.Height = 28
    $iconBorder.CornerRadius = New-Object System.Windows.CornerRadius 14
    $iconBorder.BorderThickness = New-Object System.Windows.Thickness 2
    $iconBorder.BorderBrush = $brushBorderIdle
    $iconBorder.Background = [System.Windows.Media.Brushes]::Transparent
    $iconBorder.VerticalAlignment = 'Top'

    $iconText = New-Object System.Windows.Controls.TextBlock
    $iconText.HorizontalAlignment = 'Center'
    $iconText.VerticalAlignment = 'Center'
    $iconText.FontSize = 14
    $iconText.FontWeight = 'Bold'
    $iconText.Foreground = $brushTextIdle
    $iconText.Text = ''
    $iconBorder.Child = $iconText

    $textStack = New-Object System.Windows.Controls.StackPanel
    $textStack.Margin = '14,0,0,0'
    $textStack.VerticalAlignment = 'Center'

    $titleText = New-Object System.Windows.Controls.TextBlock
    $titleText.Text = $title
    $titleText.FontSize = 14
    $titleText.Foreground = $brushTextIdle

    $detailText = New-Object System.Windows.Controls.TextBlock
    $detailText.FontSize = 11
    $detailText.Foreground = $brushTextMuted
    $detailText.Margin = '0,2,0,0'
    $detailText.Text = ''

    $textStack.Children.Add($titleText) | Out-Null
    $textStack.Children.Add($detailText) | Out-Null
    $row.Children.Add($iconBorder) | Out-Null
    $row.Children.Add($textStack) | Out-Null

    $stepsPanel.Children.Add($row) | Out-Null

    $steps[$id] = @{
        IconBorder = $iconBorder
        IconText   = $iconText
        TitleText  = $titleText
        DetailText = $detailText
    }
}

function Pump-Events {
    $frame = New-Object System.Windows.Threading.DispatcherFrame
    [System.Windows.Threading.Dispatcher]::CurrentDispatcher.BeginInvoke(
        [System.Windows.Threading.DispatcherPriority]::Background,
        [Action]{ $frame.Continue = $false }) | Out-Null
    [System.Windows.Threading.Dispatcher]::PushFrame($frame)
}

function Update-Step([string]$id, [string]$status, [string]$detail = '') {
    $s = $steps[$id]
    switch ($status) {
        'running' {
            $s.IconBorder.BorderBrush = $brushBorderRun
            $s.IconBorder.Background = [System.Windows.Media.Brushes]::Transparent
            $s.IconText.Text = [char]0x25CF
            $s.IconText.Foreground = $brushBorderRun
            $s.TitleText.Foreground = $brushTextActive
        }
        'ok' {
            $s.IconBorder.BorderBrush = $brushBorderOk
            $s.IconBorder.Background = $brushBorderOk
            $s.IconText.Text = [char]0x2713
            $s.IconText.Foreground = $brushNavyDeep
            $s.TitleText.Foreground = $brushTextActive
        }
        'skip' {
            $s.IconBorder.BorderBrush = $brushBorderSkip
            $s.IconBorder.Background = [System.Windows.Media.Brushes]::Transparent
            $s.IconText.Text = [char]0x2013
            $s.IconText.Foreground = $brushBorderSkip
            $s.TitleText.Foreground = $brushTextMuted
        }
        'fail' {
            $s.IconBorder.BorderBrush = $brushBorderFail
            $s.IconBorder.Background = $brushBorderFail
            $s.IconText.Text = [char]0x2715
            $s.IconText.Foreground = $brushNavyDeep
            $s.TitleText.Foreground = $brushBorderFail
        }
    }
    if ($detail) { $s.DetailText.Text = $detail }
    Pump-Events
}

Add-Step 'ssh'      'Install Windows OpenSSH Server'
Add-Step 'config'   "Configure sshd to listen on port $sshPort"
Add-Step 'service'  'Enable and start sshd service'
Add-Step 'firewall' "Open firewall for SSH (TCP $sshPort)"
Add-Step 'key'      'Authorize DockerBuddy public key'
Add-Step 'restart'  'Restart sshd'

$script:setupFailed = $false

function Run-Setup {
    try {
        Update-Step 'ssh' 'running'
        Write-Log 'Checking OpenSSH capability'
        $cap = Get-WindowsCapability -Online -Name OpenSSH.Server*
        if ($cap.State -eq 'Installed') {
            Update-Step 'ssh' 'skip' 'Already installed'
        } else {
            Write-Log 'Installing OpenSSH.Server'
            Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null
            Update-Step 'ssh' 'ok' 'Installed'
        }

        Update-Step 'config' 'running'
        $sshdConfig = 'C:\ProgramData\ssh\sshd_config'
        $sshdDir = Split-Path $sshdConfig -Parent
        if (-not (Test-Path $sshdDir)) {
            New-Item -ItemType Directory -Path $sshdDir -Force | Out-Null
        }
        if (-not (Test-Path $sshdConfig)) {
            New-Item -ItemType File -Path $sshdConfig -Force | Out-Null
        }
        $cfgLines = Get-Content -Path $sshdConfig -ErrorAction SilentlyContinue
        if (-not $cfgLines) { $cfgLines = @() }
        $portWanted = "Port $sshPort"
        $hasMatchingPort = $false
        $newLines = New-Object System.Collections.Generic.List[string]
        foreach ($line in $cfgLines) {
            if ($line -match '^\s*#?\s*Port\s+\d+\s*$') {
                if (-not $hasMatchingPort) {
                    $newLines.Add($portWanted) | Out-Null
                    $hasMatchingPort = $true
                }
            } else {
                $newLines.Add($line) | Out-Null
            }
        }
        if (-not $hasMatchingPort) {
            $newLines.Add($portWanted) | Out-Null
        }
        Set-Content -Path $sshdConfig -Value $newLines -Encoding ASCII
        Update-Step 'config' 'ok' "sshd_config Port = $sshPort"

        Update-Step 'service' 'running'
        Set-Service -Name sshd -StartupType Automatic
        Start-Service sshd
        Update-Step 'service' 'ok' 'Running, set to auto-start'

        Update-Step 'firewall' 'running'
        $ruleName = "DockerBuddy SSH ($sshPort)"
        # Tear down any prior DockerBuddy / default rules so we don't leave
        # stale TCP/22 (or older custom-port) holes punched in the firewall.
        Get-NetFirewallRule -DisplayName 'DockerBuddy SSH*' -ErrorAction SilentlyContinue |
            Remove-NetFirewallRule -ErrorAction SilentlyContinue
        $defaultRule = Get-NetFirewallRule -Name 'sshd' -ErrorAction SilentlyContinue
        if ($defaultRule) {
            if ($sshPort -eq 22) {
                Set-NetFirewallRule -Name 'sshd' -Enabled True -Direction Inbound -Action Allow
                Set-NetFirewallRule -Name 'sshd' -Protocol TCP -LocalPort 22 -ErrorAction SilentlyContinue
                Update-Step 'firewall' 'skip' 'Default sshd rule refreshed (TCP/22)'
            } else {
                Disable-NetFirewallRule -Name 'sshd' -ErrorAction SilentlyContinue
                New-NetFirewallRule -DisplayName $ruleName -Enabled True -Direction Inbound `
                    -Protocol TCP -Action Allow -LocalPort $sshPort | Out-Null
                Update-Step 'firewall' 'ok' "Default rule disabled; allowing TCP/$sshPort"
            }
        } else {
            $allowName = if ($sshPort -eq 22) { 'sshd' } else { $ruleName }
            New-NetFirewallRule -Name $allowName -DisplayName "OpenSSH Server (sshd $sshPort)" `
                -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort $sshPort | Out-Null
            Update-Step 'firewall' 'ok' "Inbound TCP/$sshPort allowed"
        }

        Update-Step 'key' 'running'
        $pubKey = @'
{{PUBKEY}}
'@.Trim()
        $authFile = 'C:\ProgramData\ssh\administrators_authorized_keys'
        $authDir = Split-Path $authFile -Parent
        if (-not (Test-Path $authDir)) {
            New-Item -ItemType Directory -Path $authDir -Force | Out-Null
        }
        $existingContent = ''
        if (Test-Path $authFile) {
            $existingContent = Get-Content -Path $authFile -Raw -ErrorAction SilentlyContinue
        }
        if ($existingContent -match [Regex]::Escape($pubKey)) {
            Update-Step 'key' 'skip' 'Key already authorized; ACLs refreshed'
        } else {
            Add-Content -Path $authFile -Value $pubKey
            Update-Step 'key' 'ok' 'Key added; ACLs locked down'
        }
        icacls $authFile /inheritance:r 2>&1 | Out-Null
        icacls $authFile /grant 'Administrators:F' 2>&1 | Out-Null
        icacls $authFile /grant 'SYSTEM:F' 2>&1 | Out-Null

        Update-Step 'restart' 'running'
        Restart-Service sshd
        Update-Step 'restart' 'ok' 'sshd reloaded with new key'

        $ipObj = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object {
                $_.IPAddress -notlike '127.*' -and
                $_.IPAddress -notlike '169.*' -and
                $_.InterfaceAlias -notlike '*WSL*' -and
                $_.InterfaceAlias -notlike '*vEthernet*' -and
                $_.PrefixOrigin -in @('Dhcp','Manual')
            } | Select-Object -First 1
        $ip = if ($ipObj) { $ipObj.IPAddress } else { 'unable to detect' }
        $ipText.Text = $ip
        $userText.Text = $env:USERNAME
        $portText.Text = "$sshPort"
        $summaryPanel.Visibility = 'Visible'
        Write-Log ("Setup complete. IP={0} User={1} Port={2}" -f $ip, $env:USERNAME, $sshPort)
    }
    catch {
        $script:setupFailed = $true
        Write-Log ("ERROR: " + $_.Exception.Message)
        $errorBanner = New-Object System.Windows.Controls.Border
        $errorBanner.Background = New-Brush 60 18 22
        $errorBanner.BorderBrush = $brushBorderFail
        $errorBanner.BorderThickness = New-Object System.Windows.Thickness 1
        $errorBanner.CornerRadius = New-Object System.Windows.CornerRadius 6
        $errorBanner.Padding = '14,10,14,10'
        $errorBanner.Margin = '0,8,0,0'
        $tb = New-Object System.Windows.Controls.TextBlock
        $tb.Text = "Setup failed: $($_.Exception.Message)`r`nSee $logPath"
        $tb.TextWrapping = 'Wrap'
        $tb.Foreground = $brushTextActive
        $tb.FontSize = 12
        $errorBanner.Child = $tb
        $stepsPanel.Children.Add($errorBanner) | Out-Null
    }
    finally {
        $closeButton.IsEnabled = $true
        $closeButton.Background = $brushBorderRun
        $closeButton.Foreground = $brushNavyDeep
        if (-not $script:setupFailed) {
            $closeButton.Content = 'All set'
        }
        Pump-Events
    }
}

$window.Add_ContentRendered({
    $window.Dispatcher.BeginInvoke([Action]{ Run-Setup }, [System.Windows.Threading.DispatcherPriority]::Background) | Out-Null
})

$window.ShowDialog() | Out-Null
if ($script:setupFailed) { exit 1 } else { exit 0 }
