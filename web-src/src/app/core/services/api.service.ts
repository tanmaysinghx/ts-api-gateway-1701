import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth.service';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  private getBaseUrl(): string {
    // If running on Angular local dev server (port 4200), point to local Go gateway (port 1701).
    if (window.location.port === '4200') {
      return 'http://localhost:1701';
    }
    // In production or embedded context, use relative paths on the same host.
    return '';
  }

  private getHeaders(): HttpHeaders {
    const token = this.auth.getToken();
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  getServices(): Observable<any[]> {
    return this.http.get<any[]>(`${this.getBaseUrl()}/admin/api/services`, { headers: this.getHeaders() });
  }

  registerService(payload: any): Observable<any> {
    return this.http.post<any>(`${this.getBaseUrl()}/admin/api/services`, payload, { headers: this.getHeaders() });
  }

  deregisterService(id: string): Observable<any> {
    return this.http.delete<any>(`${this.getBaseUrl()}/admin/api/services/${id}`, { headers: this.getHeaders() });
  }

  getStats(): Observable<any> {
    return this.http.get<any>(`${this.getBaseUrl()}/admin/api/stats`, { headers: this.getHeaders() });
  }

  getLogs(): Observable<any[]> {
    return this.http.get<any[]>(`${this.getBaseUrl()}/admin/api/logs`, { headers: this.getHeaders() });
  }

  generateToken(): Observable<any> {
    return this.http.post<any>(`${this.getBaseUrl()}/admin/api/token`, {}, { headers: this.getHeaders() });
  }
}
