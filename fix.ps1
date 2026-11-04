$b = [System.IO.File]::ReadAllBytes("mdt.html")
$iso = [System.Text.Encoding]::GetEncoding('ISO-8859-1').GetString($b)

$pairs = @(
  @('≡ƒôï', ''),
  @('≡ƒÄ«', ''),
  @('ΓÇö', ' - '),
  @('ΓåÆ', ''),
  @('Γ¥î', ''),
  @('┬╖', ' • '),
  @('≡ƒÜö', '👮'),
  @('≡ƒÜù', '🚗'),
  @('≡ƒö½', '🔫'),
  @('≡ƒ¢í', '📋'),
  @('≡ƒ¢ú', '🚔'),
  @('≡ƒÜÆ', '🚒'),
  @('≡ƒöº', '🚗'),
  @('≡ƒÜæ', '🚑'),
  @('≡ƒÅó', '🏛️'),
  @('≡ƒÆ░', '💰'),
  @('≡ƒô£', '📜'),
  @('∩╕Å', ''),
  @('∩╕', ''),
  @('├│', 'o'),
  @('├¡', 'a'),
  @('├ú', 'u'),
  @('Direcci├│n', 'Direccion'),
  @('Polic├¡a', 'Policia'),
  @('Veh├¡culos', 'Vehiculos'),
  @('M├⌐dicas', 'Medicas')
)

foreach ($pair in $pairs) {
  $iso = $iso.Replace($pair[0], $pair[1])
}

[System.IO.File]::WriteAllText("mdt.html", $iso, [System.Text.Encoding]::UTF8)
Write-Host "LIMPIADO"
