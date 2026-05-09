import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  isLoggedIn = signal<boolean>(!!localStorage.getItem('admin_token'));

  private getBaseUrl(): string {
    // If running on Angular local dev server (port 4200), point to local Go gateway (port 1701).
    if (window.location.port === '4200') {
      return 'http://localhost:1701';
    }
    // In production or embedded context, use relative paths on the same host.
    return '';
  }

  login(username: string, password: string) {
    return this.http.post<any>(`${this.getBaseUrl()}/admin/api/login`, { username, password }).pipe(
      tap(res => {
        if (res && res.token) {
          localStorage.setItem('admin_token', res.token);
          this.isLoggedIn.set(true);
        }
      })
    );
  }

  logout() {
    localStorage.removeItem('admin_token');
    this.isLoggedIn.set(false);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem('admin_token');
  }
}
