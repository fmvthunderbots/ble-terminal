# BLE Terminal Protokolü (v1)

İnternetsiz, BLE üzerinden 1 istemci <-> 1 sunucu metin veri bağlantısı.

## Adlar
| Öğe | Değer |
|---|---|
| Ürün adı (web ve Android) | BLE Terminal |
| Reklamdaki cihaz adı | `BLE-TERM` |
| Android paket adı | `com.ornek.bleterminal` |

## Roller
| Rol | Kim | BLE rolü |
|---|---|---|
| Sunucu | Android uygulaması | Peripheral + GATT Server, reklam yapar |
| İstemci | Web sayfası (Chrome / Bluefy) | Central + GATT Client, bağlanır |

Web Bluetooth yalnız central olabildiği için sunucu her zaman Android'dir.

## GATT
| Öğe | UUID | Özellik |
|---|---|---|
| Servis | `7a1c3e52-4b8d-4f6a-9c21-5d0e8b3a1f77` | Primary |
| RX (istemci -> sunucu) | `7a1c3e53-4b8d-4f6a-9c21-5d0e8b3a1f77` | WRITE (with response) |
| TX (sunucu -> istemci) | `7a1c3e54-4b8d-4f6a-9c21-5d0e8b3a1f77` | NOTIFY |
| TX CCCD | `00002902-0000-1000-8000-00805f9b34fb` | Read/Write, zorunlu |

- Sunucu RX yazmasına her zaman `GATT_SUCCESS` yanıtı döner (with response).
- Sunucu, istemci CCCD'ye `0x0001` yazmadan TX'e bildirim göndermez.
- CCCD yazma isteğine de `sendResponse` ile yanıt verilir.

## Reklam (Android)
- Reklam paketi: Flags + 128-bit servis UUID (yaklaşık 21 bayt).
- Tarama yanıtı (scan response): cihaz adı.
- Neden ayrı: 128-bit UUID + cihaz adı tek pakette 31 baytlık eski reklam sınırını aşabilir. Aşarsa reklam `ADVERTISE_FAILED_DATA_TOO_LARGE` ile başlamaz.
- Android reklamda yalnız Bluetooth adaptörünün adını gönderebilir. Uygulama reklam başlarken adaptör adını `BLE-TERM` yapar, durdurunca eski adı geri yükler. Uygulama çökerse eski ad bir sonraki açılışta geri yüklenir.
- İstemci filtreyi servis UUID'si ile yapar, ada güvenmez.

## Veri çerçevesi
```
[4 bayt uzunluk N, big-endian, işaretsiz][N bayt UTF-8 JSON]
```
JSON türleri:
```json
{"type":"msg","id":"<uuid v4>","ts":1763790000000,"text":"Merhaba"}
{"type":"ping"}
{"type":"pong"}
```
- `ts`: gönderenin saatine göre Unix milisaniye.
- `id`: tekrar gelen satırı ayıklamak için. Aynı `id` ikinci kez gelirse gösterilmez.
- Bilinmeyen `type` yok sayılır, hata günlüğüne yazılır.

## Parçalama
- Çerçeve (başlık + JSON) en fazla **20 baytlık** parçalara bölünür. Son parça daha kısa olabilir.
- 20 bayt = varsayılan ATT MTU (23) - 3. MTU anlaşmasına bağlı kalınmaz.
- Gönderim sırası korunur: bir parça bitmeden sonraki yazılmaz.
  - İstemci: her `writeValueWithResponse` promise'ini bekler.
  - Sunucu: her `notifyCharacteristicChanged` sonrası `onNotificationSent` callback'ini bekleyen kuyruk.

## Birleştirme (alıcı)
1. Gelen parçayı tampona ekle.
2. Tampon >= 4 bayt ise N'yi oku.
3. N > 16384 ise çerçeve bozuk say: tamponu sıfırla, hata yaz.
4. Tampon >= 4 + N ise ilk 4+N baytı al, JSON'u çöz, kalanı tamponda bırak, 2. adıma dön.
5. Bağlantı kopunca tampon sıfırlanır.

Metin sınırı: istemci ve sunucu, UTF-8 JSON'u 16384 baytı aşan satırı göndermez, kullanıcıya uyarı gösterir.

## Canlılık (ping/pong)
- İstemci bağlıyken her 15 sn'de `ping` gönderir.
- Sunucu her `ping`'e `pong` ile yanıt verir.
- İstemci 3 ping'e üst üste yanıt alamazsa bağlantıyı koptu sayar ve yeniden bağlanmayı dener.
- Sunucu `ping` göndermez; kopmayı Android'in bağlantı callback'inden anlar.

## Bağlantı yaşam döngüsü
**Sunucu:** Reklam -> istemci bağlanır -> istemci TX CCCD'yi açınca "istemci" o cihaz olur ve reklam durur (tek bağlantı) -> istemci kopunca tampon ve kuyruk sıfırlanır -> reklam yeniden başlar. İstemci, LE bağlantısı anında değil CCCD yazmasında belirlenir: telefonun saat/kulaklık gibi başka LE bağlantıları karışmasın diye. Bir istemci varken başka bir cihaz CCCD'yi açarsa o cihaz reddedilir (`cancelConnection`).

**İstemci:** `requestDevice` (kullanıcı hareketi gerekir) -> `gatt.connect` -> servis -> TX `startNotifications` -> RX hazır -> ping döngüsü. Kopunca "Bağlantı koptu", otomatik 3 deneme (2, 4, 8 sn arayla), sonra "Yeniden bağlan" düğmesi. Yeniden bağlanma aynı `BluetoothDevice` nesnesiyle `gatt.connect()` ile yapılır, seçim penceresi tekrar açılmaz.

## Emin olunmayan noktalar (testte doğrulanacak)
- **Bluefy:** Web Bluetooth'u destekler, ancak `writeValueWithResponse` olmayabilir. Yoksa eski `writeValue` kullanılır (o da with-response yazar). Otomatik yeniden bağlanma davranışı doğrulanmadı.
- **Bluefy çevrimdışı açılış:** iOS'ta Safari dışındaki tarayıcılar WKWebView kullanır. WKWebView'de service worker çoğunlukla çalışmaz, bu yüzden iPad'de sayfa internetsiz açılmayabilir. Testte doğrulanacak.
- **Windows Chrome:** Adaptör adı değişimi Windows'ta önbellekten dolayı eski adla görünebilir. Filtre UUID ile olduğu için bağlantıyı etkilemez.
- **Android adaptör adı değişimi:** Bazı Samsung sürümlerinde `setName` gecikmeli uygulanabilir.
- **Samsung pil optimizasyonu:** Foreground service olsa bile "Uyku" listesine alınırsa kopma olabilir.
