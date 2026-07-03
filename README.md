# WatchGether

Minimalne rozszerzenie Chrome synchronizujące odtwarzanie Crunchyrolla między dwiema osobami. Synchronizowane są: odtwarzanie, pauza, przewijanie i prędkość. Obie osoby mogą sterować odtwarzaczem, a host co 3 sekundy koryguje dryf. Uczestnicy mają nicki, dostają powiadomienia o dołączeniu i wyjściu oraz widzą historię aktywności pokoju.

## Architektura

- `apps/extension` — rozszerzenie Chrome Manifest V3, TypeScript i Vite;
- `apps/server` — serwer HTTP/WebSocket w Node.js;
- pokój ma losowy, sześciocyfrowy kod i maksymalnie dwóch uczestników;
- stan pokoju istnieje w pamięci serwera. Restart serwera lub wyjście hosta zamyka pokój.
- historia obejmuje maksymalnie 100 ostatnich zdarzeń i znika wraz z pokojem.

Serwer nie przesyła obrazu ani danych logowania. Każdy uczestnik ogląda materiał ze swojego konta Crunchyroll.

## Uruchomienie lokalne

Wymagane są Node.js 20+ i npm.

```powershell
npm install
npm run build
npm run dev:server
```

Następnie:

1. Otwórz `chrome://extensions`.
2. Włącz **Tryb dewelopera**.
3. Kliknij **Załaduj rozpakowane** i wskaż `apps/extension/dist`.
4. Otwórz stronę odcinka na Crunchyrollu i odśwież kartę.
5. Na pierwszym urządzeniu utwórz pokój, a na drugim wpisz wyświetlony kod.

Domyślny adres serwera to `ws://localhost:8787`. Przy testowaniu na dwóch fizycznych urządzeniach `localhost` drugiego urządzenia nie wskazuje komputera z serwerem. W ustawieniach rozszerzenia podaj wtedy adres komputera w sieci lokalnej, np. `ws://192.168.1.20:8787`, i dopuść port 8787 w zaporze.

## Weryfikacja

```powershell
npm test
npm run typecheck
npm run build
```

Endpoint kontrolny serwera jest dostępny pod `http://localhost:8787/health`.

## Wdrożenie serwera

W środowisku publicznym użyj domeny z TLS i adresu `wss://...`. Obraz serwera zbudujesz z katalogu głównego poleceniem `docker build -f apps/server/Dockerfile -t watchgether-server .`. Platforma musi przekazywać połączenia WebSocket i zmienną `PORT`. Opcjonalna zmienna `ALLOWED_ORIGIN` ogranicza pojedynczy nagłówek Origin, ale przy rozszerzeniu Chrome lepiej egzekwować dostęp przez uwierzytelnianie dodane w kolejnej wersji.

## Zakres MVP i ograniczenia

- Obie osoby muszą ręcznie otworzyć ten sam odcinek i posiadać dostęp do materiału.
- Nie są synchronizowane wybór odcinka, napisy, jakość, pełny ekran ani reklamy.
- Dane pokojów nie są zapisywane i nie ma kont użytkowników.
- Integracja używa standardowego elementu HTML `<video>`. Zmiana implementacji playera przez Crunchyroll może wymagać aktualizacji selektora/integracji.
- Autoplay może wymagać pierwszego kliknięcia odtwarzacza na każdym urządzeniu.

Przed publikacją w Chrome Web Store należy dodać ikony, politykę prywatności, publiczny serwer `wss`, rate limiting oraz wersjonowane testy integracyjne z aktualnym odtwarzaczem Crunchyrolla.
